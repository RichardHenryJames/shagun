import sharp from "sharp";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type ProviderError = { code?: string; message: string; details?: string };
type QueryResult = { data: unknown; error: ProviderError | null; count?: number | null };
type DownloadResult = { data: Blob | null; error: ProviderError | null };
const mocks = vi.hoisted(() => ({
  getAdminContext: vi.fn<() => Promise<unknown>>(),
  anonymousClient: vi.fn(), serviceClient: vi.fn(), sessionClient: vi.fn(),
  headers: vi.fn<() => Promise<Headers>>(),
  enforceRateLimit: vi.fn<(scope: string, subject: string, limit: number, seconds: number) => Promise<void>>(),
  revalidatePath: vi.fn(), revalidateTag: vi.fn(), fetch: vi.fn<typeof fetch>(),
}));
vi.mock("@/lib/auth", () => ({ getAdminContext: mocks.getAdminContext }));
vi.mock("@/lib/db/clients", () => ({ anonymousClient: mocks.anonymousClient, serviceClient: mocks.serviceClient, sessionClient: mocks.sessionClient }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath, revalidateTag: mocks.revalidateTag }));
vi.mock("@/lib/security", async () => ({
  ...await vi.importActual<typeof import("@/lib/security")>("@/lib/security"),
  enforceRateLimit: mocks.enforceRateLimit,
}));

// Route handlers run directly: real origin/body helpers and Sharp, no server or DB.
import { POST as uploadMedia } from "@/app/api/admin/media/route";
import { DELETE as deleteMedia, GET as adminMedia, PATCH as editMedia } from "@/app/api/admin/media/[id]/route";
import { GET as publicMedia } from "@/app/media/[id]/[width]/route";
import { POST as recordEvent } from "@/app/api/events/route";
import { HttpError } from "@/lib/security";

const SITE = "https://shagun.example.test";
const CITY_ID = "10000000-0000-4000-8000-000000000001";
const VENUE_ID = "20000000-0000-4000-8000-000000000002";
const ADMIN_ID = "30000000-0000-4000-8000-000000000003";
const ROOT = "40000000-0000-4000-8000-000000000004";
const PHOTO_ID = "50000000-0000-4000-8000-000000000005";
const IP = "192.0.2.10";
const PRIVATE_DETAIL = "synthetic-private-sql-and-storage-provider-detail";
const FILE_NAME = "untrusted-original-image.PNG";
const ALT = "Synthetic blue rectangle";
const CREDIT = "Generated solely for this unit test";
const ADMIN_PATH = `/api/admin/media/${PHOTO_ID}`;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
let png: Buffer;
let webp: Buffer;

// Explicit result types keep null/error overrides valid instead of inferring
// a success-only Supabase mock type from the initial return value.
function query(result: QueryResult) {
  const pending = Promise.resolve(result);
  const builder = {
    select: vi.fn(), eq: vi.fn(), delete: vi.fn(),
    maybeSingle: vi.fn<() => Promise<QueryResult>>().mockResolvedValue(result),
    then: pending.then.bind(pending),
  };
  for (const method of ["select", "eq", "delete"] as const) builder[method].mockReturnValue(builder);
  return builder;
}
function storage() {
  const bucket = {
    upload: vi.fn<(path: string, bytes: Uint8Array, options: Record<string, unknown>) => Promise<QueryResult>>().mockResolvedValue({ data: null, error: null }),
    download: vi.fn<(path: string) => Promise<DownloadResult>>().mockResolvedValue({ data: new Blob([new Uint8Array(webp)], { type: "image/webp" }), error: null }),
    remove: vi.fn(), createSignedUrl: vi.fn(), createSignedUrls: vi.fn(), getPublicUrl: vi.fn(),
  };
  return { ...bucket, from: vi.fn((name: string) => {
    if (name !== "shagun-media") throw new Error("Unexpected storage bucket in unit test.");
    return bucket;
  }) };
}
function makeSession() {
  const owner = query({ data: { id: VENUE_ID }, error: null });
  const mediaResult: QueryResult = { data: { id: PHOTO_ID, storage_key: ROOT }, error: null, count: 0 };
  const media = query(mediaResult);
  const client = {
    from: vi.fn((table: string): ReturnType<typeof query> => {
      if (table === "venues" || table === "cities") return owner;
      if (table === "media_assets") return media;
      throw new Error("Unexpected session table in unit test.");
    }),
    rpc: vi.fn<(name: string, args: Record<string, unknown>) => Promise<QueryResult>>().mockImplementation(async (name) => {
      if (name === "begin_media_upload" || name === "update_photo") return { data: null, error: null };
      if (name === "finalize_media_upload") return { data: { id: PHOTO_ID }, error: null };
      throw new Error("Unexpected session RPC in unit test.");
    }),
    storage: storage(),
  };
  return { client, owner, media, mediaResult };
}
function makeService() {
  return {
    from: vi.fn(), storage: storage(),
    rpc: vi.fn<(name: string, args: Record<string, unknown>) => Promise<QueryResult>>().mockResolvedValue({ data: null, error: null }),
  };
}
function adminContext(id = PHOTO_ID) { return { params: Promise.resolve({ id }) }; }
function publicContext(id = PHOTO_ID, width = "960") { return { params: Promise.resolve({ id, width }) }; }
function uploadForm(owner: "venue_id" | "city_id" = "venue_id") {
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(png)], { type: "image/png" }), FILE_NAME);
  form.set(owner, owner === "venue_id" ? VENUE_ID : CITY_ID);
  form.set("alt_text", `  ${ALT}  `);
  form.set("credit", `  ${CREDIT}  `);
  return form;
}
function uploadRequest(form = uploadForm()) {
  return new Request(`${SITE}/api/admin/media`, { method: "POST", headers: { origin: SITE }, body: form });
}
function jsonRequest(path: string, payload: unknown, method = "POST") {
  return new Request(`${SITE}${path}`, { method, headers: { origin: SITE, "content-type": "application/json" }, body: JSON.stringify(payload) });
}
function brokenJson(path: string, method = "POST") {
  return new Request(`${SITE}${path}`, { method, headers: { origin: SITE, "content-type": "application/json" }, body: "{" });
}
async function expectError(response: Response, status: number, message?: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  const body: unknown = await response.json();
  expect(body).toEqual({ error: message ?? expect.any(String) });
  expect(JSON.stringify(body)).not.toContain(PRIVATE_DETAIL);
  expect(JSON.stringify(body)).not.toContain(ROOT);
}
function expectNoRefresh() {
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
  expect(mocks.revalidateTag).not.toHaveBeenCalled();
}
function expectNoUploadWrites() {
  expect(session.client.rpc).not.toHaveBeenCalled();
  expect(session.client.storage.from).not.toHaveBeenCalled();
  expectNoRefresh();
}

let session: ReturnType<typeof makeSession>;
let service: ReturnType<typeof makeService>;
let publicQuery: ReturnType<typeof query>;
beforeAll(async () => {
  png = await sharp({ create: { width: 8, height: 4, channels: 3, background: { r: 32, g: 96, b: 160 } } }).png().toBuffer();
  webp = await sharp(png).webp().toBuffer();
});
beforeEach(() => {
  vi.resetAllMocks();
  for (const [name, value] of Object.entries({
    NEXT_PUBLIC_SITE_URL: SITE, NEXT_PUBLIC_SUPABASE_URL: "https://database.example.test",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "unit-test-only-publishable-key",
    NEXT_PUBLIC_ANALYTICS_ENABLED: "true", SHAGUN_TEST_FIXTURES: "false", VERCEL: "1",
  })) vi.stubEnv(name, value);
  session = makeSession();
  service = makeService();
  publicQuery = query({ data: { storage_key: ROOT }, error: null });
  mocks.getAdminContext.mockResolvedValue({ client: session.client, admin: { id: ADMIN_ID, display_name: "Synthetic administrator", is_active: true } });
  mocks.anonymousClient.mockReturnValue({ from: vi.fn((table: string) => {
    if (table !== "media_assets") throw new Error("Unexpected anonymous table in unit test.");
    return publicQuery;
  }) });
  mocks.serviceClient.mockReturnValue(service);
  mocks.headers.mockResolvedValue(new Headers({ "x-vercel-forwarded-for": IP }));
  mocks.enforceRateLimit.mockResolvedValue(undefined);
  mocks.fetch.mockImplementation(() => { throw new Error("Network access is forbidden in route unit tests."); });
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(service.from).not.toHaveBeenCalled();
  expect(mocks.sessionClient).not.toHaveBeenCalled();
  for (const source of [session.client.storage, service.storage]) {
    expect(source.createSignedUrl).not.toHaveBeenCalled();
    expect(source.createSignedUrls).not.toHaveBeenCalled();
    expect(source.getPublicUrl).not.toHaveBeenCalled();
  }
});

describe("admin media authorization and private previews", () => {
  it("returns 401 for every unauthenticated handler before ID/body parsing, limits or storage", async () => {
    mocks.getAdminContext.mockResolvedValue(null);
    const post = brokenJson("/api/admin/media");
    const patch = brokenJson(ADMIN_PATH, "PATCH");
    const deletion = new Request(`${SITE}${ADMIN_PATH}`, { method: "DELETE", headers: { origin: SITE } });
    const responses = [
      await uploadMedia(post),
      await adminMedia(new Request(`${SITE}${ADMIN_PATH}?w=invalid`), adminContext("invalid")),
      await editMedia(patch, adminContext("invalid")),
      await deleteMedia(deletion, adminContext("invalid")),
    ];
    for (const response of responses) await expectError(response, 401);
    expect(post.bodyUsed).toBe(false);
    expect(patch.bodyUsed).toBe(false);
    expect(mocks.getAdminContext).toHaveBeenCalledTimes(4);
    expect(session.client.from).not.toHaveBeenCalled();
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.serviceClient).not.toHaveBeenCalled();
    expect(mocks.anonymousClient).not.toHaveBeenCalled();
    expectNoUploadWrites();
  });

  it("rejects cross-origin mutations before looking up an administrator", async () => {
    for (const method of ["POST", "PATCH", "DELETE"]) {
      const request = brokenJson(ADMIN_PATH, method);
      request.headers.set("origin", "https://other.example.test");
      const response = method === "POST" ? await uploadMedia(request)
        : method === "PATCH" ? await editMedia(request, adminContext()) : await deleteMedia(request, adminContext());
      await expectError(response, 403);
      expect(request.bodyUsed).toBe(false);
    }
    expect(mocks.getAdminContext).not.toHaveBeenCalled();
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expectNoUploadWrites();
  });

  it("serves a draft preview only through the session client, defaulting to 960 and private no-store", async () => {
    const response = await adminMedia(new Request(`${SITE}${ADMIN_PATH}`), adminContext());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("location")).toBeNull();
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array(webp));
    expect(session.client.from).toHaveBeenCalledExactlyOnceWith("media_assets");
    expect(session.media.select).toHaveBeenCalledExactlyOnceWith("storage_key");
    expect(session.media.eq).toHaveBeenCalledExactlyOnceWith("id", PHOTO_ID);
    expect(session.client.storage.from).toHaveBeenCalledExactlyOnceWith("shagun-media");
    expect(session.client.storage.download).toHaveBeenCalledExactlyOnceWith(`${ROOT}/960.webp`);
    expect(mocks.anonymousClient).not.toHaveBeenCalled();
    expect(mocks.serviceClient).not.toHaveBeenCalled();
    expectNoRefresh();
  });

  it("does not access storage for a missing session-visible photo", async () => {
    session.media.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expectError(await adminMedia(new Request(`${SITE}${ADMIN_PATH}?w=480`), adminContext()), 404);
    expect(session.client.storage.from).not.toHaveBeenCalled();
    expect(mocks.serviceClient).not.toHaveBeenCalled();
  });
});

describe("session-owned media uploads and durable reservations", () => {
  it.each(["venue_id", "city_id"] as const)("validates %s ownership, awaits reservation and all three uploads, then finalizes only server-built metadata", async (ownerColumn) => {
    const ownerId = ownerColumn === "venue_id" ? VENUE_ID : CITY_ID;
    session.owner.maybeSingle.mockResolvedValue({ data: { id: ownerId }, error: null });
    const reservationStarted = Promise.withResolvers<void>();
    const reservation = Promise.withResolvers<QueryResult>();
    const lastWriteStarted = Promise.withResolvers<void>();
    const lastWrite = Promise.withResolvers<QueryResult>();
    session.client.rpc.mockImplementation(async (name) => {
      if (name === "begin_media_upload") { reservationStarted.resolve(); return reservation.promise; }
      if (name === "finalize_media_upload") return { data: { id: PHOTO_ID }, error: null };
      throw new Error("Unexpected upload RPC.");
    });
    session.client.storage.upload.mockImplementation(async (path) => {
      if (path.endsWith("/1600.webp")) { lastWriteStarted.resolve(); return lastWrite.promise; }
      return { data: null, error: null };
    });
    const pending = uploadMedia(uploadRequest(uploadForm(ownerColumn)));
    await reservationStarted.promise;
    try { expect(session.client.storage.upload).not.toHaveBeenCalled(); }
    finally { reservation.resolve({ data: null, error: null }); }
    await lastWriteStarted.promise;
    try {
      expect(session.client.rpc.mock.calls.map(([name]) => name)).toEqual(["begin_media_upload"]);
      expectNoRefresh();
    } finally { lastWrite.resolve({ data: null, error: null }); }
    const response = await pending;
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ photo: { id: PHOTO_ID } });
    expect(mocks.enforceRateLimit).toHaveBeenCalledExactlyOnceWith("admin-upload", ADMIN_ID, 30, 60);
    expect(session.client.from.mock.calls.map(([table]) => table)).toEqual([ownerColumn === "venue_id" ? "venues" : "cities", "media_assets"]);
    expect(session.owner.select).toHaveBeenCalledWith("id");
    expect(session.owner.eq).toHaveBeenCalledWith("id", ownerId);
    expect(session.media.select).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(session.media.eq).toHaveBeenCalledWith(ownerColumn, ownerId);
    const key = session.client.rpc.mock.calls[0][1].p_key;
    expect(key).toEqual(expect.stringMatching(UUID_V4));
    if (typeof key !== "string") throw new Error("Expected a server-generated storage root.");
    expect(session.client.rpc.mock.calls).toEqual([
      ["begin_media_upload", { p_key: key }],
      ["finalize_media_upload", { p_data: {
        venue_id: ownerColumn === "venue_id" ? VENUE_ID : null, city_id: ownerColumn === "city_id" ? CITY_ID : null,
        alt_text: ALT, credit: CREDIT, storage_key: key, width: 8, height: 4,
      } }],
    ]);
    expect(JSON.stringify(session.client.rpc.mock.calls)).not.toContain(FILE_NAME);
    expect(session.client.storage.from.mock.calls).toEqual([["shagun-media"], ["shagun-media"], ["shagun-media"]]);
    expect(session.client.storage.upload).toHaveBeenCalledTimes(3);
    for (const [index, width] of [480, 960, 1600].entries()) {
      const [path, bytes, options] = session.client.storage.upload.mock.calls[index];
      expect(path).toBe(`${key}/${width}.webp`);
      expect(options).toEqual({ contentType: "image/webp", cacheControl: "60", upsert: false });
      expect(await sharp(bytes).metadata()).toMatchObject({ format: "webp", width: 8, height: 4 });
    }
    expect(session.client.rpc.mock.invocationCallOrder[0]).toBeLessThan(session.client.storage.upload.mock.invocationCallOrder[0]);
    expect(session.client.storage.upload.mock.invocationCallOrder[2]).toBeLessThan(session.client.rpc.mock.invocationCallOrder[1]);
    expect(mocks.revalidateTag).toHaveBeenCalledExactlyOnceWith("inventory", { expire: 0 });
    expect(mocks.revalidatePath).toHaveBeenCalledExactlyOnceWith("/", "layout");
    expect(session.client.rpc.mock.invocationCallOrder[1]).toBeLessThan(mocks.revalidateTag.mock.invocationCallOrder[0]);
    expect(mocks.serviceClient).not.toHaveBeenCalled();
    expect(mocks.anonymousClient).not.toHaveBeenCalled();
  });

  it("rejects unknown/duplicate multipart fields, invalid ownership, missing metadata and non-image files", async () => {
    const cases: Array<[string, (form: FormData) => void, number]> = [
      ["unknown field", (form) => form.set("storage_key", ROOT), 400],
      ["duplicate scalar", (form) => form.append("credit", CREDIT), 400],
      ["duplicate file", (form) => form.append("file", new Blob([new Uint8Array(png)], { type: "image/png" }), "second.png"), 400],
      ["both owners", (form) => form.set("city_id", CITY_ID), 400],
      ["no owner", (form) => form.delete("venue_id"), 400],
      ["invalid owner", (form) => form.set("venue_id", "not-a-uuid"), 400],
      ["short alternative text", (form) => form.set("alt_text", "tiny"), 400],
      ["missing credit", (form) => form.delete("credit"), 400],
      ["text instead of file", (form) => form.set("file", "synthetic.png"), 415],
      ["unsupported extension", (form) => form.set("file", new Blob([new Uint8Array(png)], { type: "image/png" }), "synthetic.svg"), 415],
    ];
    for (const [label, mutate, status] of cases) {
      const form = uploadForm();
      mutate(form);
      const response = await uploadMedia(uploadRequest(form));
      expect(response.status, label).toBe(status);
      await expectError(response, status);
    }
    expect(session.client.from).not.toHaveBeenCalled();
    expectNoUploadWrites();
  });

  it.each([{ owner: "venue_id", quota: 24 }, { owner: "city_id", quota: 1 }] as const)("enforces the $quota-photo $owner quota before processing or reserving", async ({ owner, quota }) => {
    session.mediaResult.count = quota;
    const form = uploadForm(owner);
    form.set("file", new Blob(["deliberately undecodable"], { type: "image/png" }), "synthetic.png");
    await expectError(await uploadMedia(uploadRequest(form)), 409);
    expect(session.media.eq).toHaveBeenCalledWith(owner, owner === "venue_id" ? VENUE_ID : CITY_ID);
    expectNoUploadWrites();
  });

  it.each(["missing owner", "owner query error", "count query error"])("fails closed for %s without reserving or touching storage", async (failure) => {
    if (failure === "missing owner") session.owner.maybeSingle.mockResolvedValue({ data: null, error: null });
    if (failure === "owner query error") session.owner.maybeSingle.mockResolvedValue({ data: null, error: { message: PRIVATE_DETAIL } });
    if (failure === "count query error") session.mediaResult.error = { message: PRIVATE_DETAIL };
    await expectError(await uploadMedia(uploadRequest()), failure === "missing owner" ? 404 : 503);
    expectNoUploadWrites();
  });

  it.each(["reservation", "second upload", "finalization", "confirmation"])("keeps cleanup retryable and never refreshes after a failed %s", async (phase) => {
    let status = 503;
    if (phase === "reservation") {
      session.client.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: PRIVATE_DETAIL } });
      status = 403;
    } else if (phase === "second upload") {
      session.client.storage.upload.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: null, error: { message: PRIVATE_DETAIL } });
    } else {
      session.client.rpc.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({
        data: null, error: phase === "finalization" ? { message: "photo_limit", details: PRIVATE_DETAIL } : null,
      });
      if (phase === "finalization") status = 409;
    }
    await expectError(await uploadMedia(uploadRequest()), status);
    const uploads = phase === "reservation" ? 0 : phase === "second upload" ? 2 : 3;
    expect(session.client.storage.upload).toHaveBeenCalledTimes(uploads);
    expect(session.client.rpc.mock.calls.map(([name]) => name)).toEqual(
      uploads < 3 ? ["begin_media_upload"] : ["begin_media_upload", "finalize_media_upload"],
    );
    expect(session.client.storage.remove).not.toHaveBeenCalled();
    expect(session.media.delete).not.toHaveBeenCalled();
    expect(mocks.serviceClient).not.toHaveBeenCalled();
    expectNoRefresh();
  });
});

describe("photo metadata, ordering and deletion", () => {
  it.each(["metadata", "cover", "up", "down"])("sends only the validated %s operation to the session RPC", async (operation) => {
    const payload = operation === "metadata" ? { operation, alt_text: ` ${ALT} `, credit: ` ${CREDIT} ` } : { operation };
    const response = await editMedia(jsonRequest(ADMIN_PATH, payload, "PATCH"), adminContext());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mocks.enforceRateLimit).toHaveBeenCalledExactlyOnceWith("admin-photo-edit", ADMIN_ID, 120, 60);
    expect(session.client.rpc).toHaveBeenCalledExactlyOnceWith("update_photo", {
      p_id: PHOTO_ID, p_operation: operation, ...(operation === "metadata" ? { p_alt: ALT, p_credit: CREDIT } : {}),
    });
    expect(session.client.rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.revalidateTag.mock.invocationCallOrder[0]);
    expect(session.client.storage.from).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON, unknown fields on either operation branch and unsupported operations", async () => {
    await expectError(await editMedia(brokenJson(ADMIN_PATH, "PATCH"), adminContext()), 400);
    for (const payload of [
      null, { operation: "delete" }, { operation: "cover", alt_text: ALT },
      { operation: "metadata", alt_text: ALT, credit: CREDIT, storage_key: ROOT },
      { operation: "metadata", alt_text: ALT },
    ]) await expectError(await editMedia(jsonRequest(ADMIN_PATH, payload, "PATCH"), adminContext()), 400);
    expectNoUploadWrites();
  });

  it("sanitizes update failures and does not invalidate inventory", async () => {
    session.client.rpc.mockResolvedValue({ data: null, error: { message: PRIVATE_DETAIL } });
    await expectError(await editMedia(jsonRequest(ADMIN_PATH, { operation: "cover" }, "PATCH"), adminContext()), 503);
    expectNoRefresh();
  });

  it("deletes through the session table and leaves object removal to the database cleanup trigger", async () => {
    const request = new Request(`${SITE}${ADMIN_PATH}`, { method: "DELETE", headers: { origin: SITE } });
    const response = await deleteMedia(request, adminContext());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mocks.enforceRateLimit).toHaveBeenCalledExactlyOnceWith("admin-photo-edit", ADMIN_ID, 120, 60);
    expect(session.client.from).toHaveBeenCalledExactlyOnceWith("media_assets");
    expect(session.media.delete).toHaveBeenCalledOnce();
    expect(session.media.eq).toHaveBeenCalledWith("id", PHOTO_ID);
    expect(session.media.select).toHaveBeenCalledWith("id");
    expect(session.media.maybeSingle.mock.invocationCallOrder[0]).toBeLessThan(mocks.revalidateTag.mock.invocationCallOrder[0]);
    expect(session.client.storage.from).not.toHaveBeenCalled();
    expect(session.client.rpc).not.toHaveBeenCalled();
    expect(mocks.serviceClient).not.toHaveBeenCalled();
  });

  it("does not report success or refresh for a missing/deletion-denied photo", async () => {
    session.media.maybeSingle.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: null, error: { code: "42501", message: PRIVATE_DETAIL } });
    for (const status of [404, 403]) {
      const request = new Request(`${SITE}${ADMIN_PATH}`, { method: "DELETE", headers: { origin: SITE } });
      await expectError(await deleteMedia(request, adminContext()), status);
    }
    expect(session.client.storage.from).not.toHaveBeenCalled();
    expectNoRefresh();
  });
});

describe("anonymous-RLS-gated public image delivery", () => {
  it("denies an RLS-filtered photo before service storage even with administrator cookies", async () => {
    publicQuery.maybeSingle.mockResolvedValue({ data: null, error: null });
    const request = new Request(`${SITE}/media/${PHOTO_ID}/960`, { headers: { cookie: "unit-test-admin-session=synthetic" } });
    await expectError(await publicMedia(request, publicContext()), 404, "Image not found.");
    expect(mocks.anonymousClient).toHaveBeenCalledExactlyOnceWith();
    expect(publicQuery.select).toHaveBeenCalledWith("storage_key");
    expect(publicQuery.eq).toHaveBeenCalledWith("id", PHOTO_ID);
    expect(mocks.getAdminContext).not.toHaveBeenCalled();
    expect(session.client.from).not.toHaveBeenCalled();
    expect(mocks.serviceClient).not.toHaveBeenCalled();
  });

  it("returns a sanitized 503 on an RLS query error, without any privileged fallback", async () => {
    publicQuery.maybeSingle.mockResolvedValue({ data: null, error: { message: PRIVATE_DETAIL, details: ROOT } });
    await expectError(await publicMedia(new Request(`${SITE}/media/${PHOTO_ID}/960`), publicContext()), 503, "Images are temporarily unavailable.");
    expect(mocks.serviceClient).not.toHaveBeenCalled();
    expect(mocks.getAdminContext).not.toHaveBeenCalled();
  });

  it.each(["480", "960", "1600"])("delivers only the gated %s variant with a 60-second public cache", async (width) => {
    const request = new Request(`${SITE}/media/${PHOTO_ID}/${width}?path=../../private/original.jpg&w=1`, { headers: { cookie: "unit-test-admin-session=synthetic" } });
    const response = await publicMedia(request, publicContext(PHOTO_ID, width));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toBe("public, max-age=60, s-maxage=60");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("location")).toBeNull();
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array(webp));
    expect(publicQuery.select).toHaveBeenCalledExactlyOnceWith("storage_key");
    expect(publicQuery.eq).toHaveBeenCalledExactlyOnceWith("id", PHOTO_ID);
    expect(service.storage.from).toHaveBeenCalledExactlyOnceWith("shagun-media");
    expect(service.storage.download).toHaveBeenCalledExactlyOnceWith(`${ROOT}/${width}.webp`);
    expect(publicQuery.maybeSingle.mock.invocationCallOrder[0]).toBeLessThan(mocks.serviceClient.mock.invocationCallOrder[0]);
    expect(mocks.getAdminContext).not.toHaveBeenCalled();
    expect(session.client.storage.from).not.toHaveBeenCalled();
  });

  it("rejects arbitrary IDs/width paths before constructing either database client", async () => {
    for (const [id, width] of [["../../private", "960"], [ROOT + "/960.webp", "480"], [PHOTO_ID, "../960"], [PHOTO_ID, "960.webp"], [PHOTO_ID, "0960"], [PHOTO_ID, "1601"]]) {
      await expectError(await publicMedia(new Request(`${SITE}/media/test`), publicContext(id, width)), 404);
    }
    expect(mocks.anonymousClient).not.toHaveBeenCalled();
    expect(mocks.serviceClient).not.toHaveBeenCalled();
  });

  it("returns 404 without any client access when the database is disabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    await expectError(await publicMedia(new Request(`${SITE}/media/${PHOTO_ID}/960`), publicContext()), 404, "Image not found.");
    expect(mocks.anonymousClient).not.toHaveBeenCalled();
    expect(mocks.serviceClient).not.toHaveBeenCalled();
  });

  it("does not expose missing-object or storage-provider details", async () => {
    service.storage.download.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: null, error: { message: PRIVATE_DETAIL } });
    for (let attempt = 0; attempt < 2; attempt++) {
      await expectError(await publicMedia(new Request(`${SITE}/media/${PHOTO_ID}/960`), publicContext()), 404, "Image not found.");
    }
  });
});

describe("privacy-preserving event ingestion", () => {
  it.each(["disabled", "DNT", "GPC", "database absent"])("returns 204 without parsing or any RPC when %s", async (reason) => {
    if (reason === "disabled") vi.stubEnv("NEXT_PUBLIC_ANALYTICS_ENABLED", "false");
    if (reason === "database absent") vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    const request = brokenJson("/api/events");
    if (reason === "DNT") request.headers.set("dnt", "1");
    if (reason === "GPC") request.headers.set("sec-gpc", "1");
    const response = await recordEvent(request);
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("");
    expect(request.bodyUsed).toBe(false);
    expect(mocks.headers).not.toHaveBeenCalled();
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.serviceClient).not.toHaveBeenCalled();
    expect(service.rpc).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON, unknown query data, invalid IDs and missing venue context", async () => {
    await expectError(await recordEvent(brokenJson("/api/events")), 400);
    for (const payload of [
      null, [], { event: "invented_event", cityId: CITY_ID }, { event: "city_viewed", cityId: "not-a-uuid" },
      { event: "city_viewed", cityId: CITY_ID, query: "synthetic search text must not be stored" },
      { event: "venue_viewed", cityId: CITY_ID }, { event: "phone_clicked", cityId: CITY_ID },
      { event: "whatsapp_clicked", cityId: CITY_ID }, { event: "venue_viewed", cityId: CITY_ID, venueId: "invalid" },
    ]) await expectError(await recordEvent(jsonRequest("/api/events", payload)), 400, "Invalid event.");
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.serviceClient).not.toHaveBeenCalled();
    expect(service.rpc).not.toHaveBeenCalled();
  });

  it("enforces the actual 512-byte event body limit even with forged Content-Length: 0", async () => {
    const request = jsonRequest("/api/events", { event: "city_viewed", cityId: CITY_ID, query: "x".repeat(512) });
    request.headers.set("content-length", "0");
    await expectError(await recordEvent(request), 413);
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.serviceClient).not.toHaveBeenCalled();
  });

  it("records all six allowed events with only validated context after the durable limiter", async () => {
    const events = ["city_viewed", "search_performed", "filter_used", "venue_viewed", "phone_clicked", "whatsapp_clicked"];
    for (const [index, event] of events.entries()) {
      const venueId = index < 3 ? undefined : VENUE_ID;
      const response = await recordEvent(jsonRequest("/api/events", { event, cityId: CITY_ID, ...(venueId ? { venueId } : {}) }));
      expect(response.status).toBe(204);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.text()).toBe("");
      expect(mocks.enforceRateLimit).toHaveBeenNthCalledWith(index + 1, "public-events", IP, 60, 60);
      expect(service.rpc).toHaveBeenNthCalledWith(index + 1, "record_event", { p_event: event, p_city: CITY_ID, p_venue: venueId ?? null });
      expect(mocks.enforceRateLimit.mock.invocationCallOrder[index]).toBeLessThan(service.rpc.mock.invocationCallOrder[index]);
    }
    expect(service.rpc).toHaveBeenCalledTimes(6);
    expect(JSON.stringify(service.rpc.mock.calls)).not.toContain(IP);
    expect(mocks.getAdminContext).not.toHaveBeenCalled();
    expect(mocks.anonymousClient).not.toHaveBeenCalled();
  });

  it("denies missing/cross-site origins even when analytics is disabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_ANALYTICS_ENABLED", "false");
    for (const origin of [null, "https://other.example.test"]) {
      const request = brokenJson("/api/events");
      if (origin) request.headers.set("origin", origin); else request.headers.delete("origin");
      await expectError(await recordEvent(request), 403);
      expect(request.bodyUsed).toBe(false);
    }
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.serviceClient).not.toHaveBeenCalled();
  });

  it("fails closed on limiter exhaustion/outage before recording an event", async () => {
    for (const status of [429, 503]) {
      mocks.enforceRateLimit.mockRejectedValueOnce(new HttpError(status, "Synthetic safe rate-limit error"));
      const response = await recordEvent(jsonRequest("/api/events", { event: "city_viewed", cityId: CITY_ID }));
      expect(response.headers.get("retry-after")).toBe(status === 429 ? "60" : null);
      await expectError(response, status, "Synthetic safe rate-limit error");
    }
    expect(mocks.serviceClient).not.toHaveBeenCalled();
    expect(service.rpc).not.toHaveBeenCalled();
  });

  it("fails closed without a trusted deployment fingerprint", async () => {
    mocks.headers.mockResolvedValue(new Headers({ "x-forwarded-for": IP }));
    await expectError(await recordEvent(jsonRequest("/api/events", { event: "city_viewed", cityId: CITY_ID })), 503);
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.serviceClient).not.toHaveBeenCalled();
  });

  it.each(["error response", "rejection"])("sanitizes an event provider %s", async (failure) => {
    if (failure === "error response") service.rpc.mockResolvedValue({ data: null, error: { message: PRIVATE_DETAIL } });
    else service.rpc.mockRejectedValue(new Error(PRIVATE_DETAIL));
    const response = await recordEvent(jsonRequest("/api/events", { event: "venue_viewed", cityId: CITY_ID, venueId: VENUE_ID }));
    await expectError(response, failure === "error response" ? 503 : 500,
      failure === "error response" ? "Events are temporarily unavailable." : "The request could not be completed. Please try again.");
  });
});