import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionState } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  sessionClient: vi.fn(), serviceClient: vi.fn(), rateRpc: vi.fn(), headers: vi.fn(),
  redirect: vi.fn(), revalidatePath: vi.fn(), revalidateTag: vi.fn(),
  redirectSignal: new Error("test-only redirect control flow"),
}));

vi.mock("@/lib/db/clients", () => ({ sessionClient: mocks.sessionClient, serviceClient: mocks.serviceClient }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath, revalidateTag: mocks.revalidateTag }));
vi.mock("@/lib/media", () => { throw new Error("Actions must use lightweight bucket constants, not the Sharp-backed media module."); });

// The parent configuration supplies the @/ alias and empty server-only module.
// Security's real HMAC/durable limiter is exercised against a mocked service RPC.
import { loginAction, logoutAction } from "@/lib/actions/auth";
import { deleteCityAction, saveCityAction } from "@/lib/actions/cities";
import { cleanupStorageAction } from "@/lib/actions/maintenance";
import { actionError } from "@/lib/actions/shared";
import { deleteVenueAction, saveVenueAction } from "@/lib/actions/venues";
import { invalidateInventory } from "@/lib/cache";

const ADMIN_ID = "30000000-0000-4000-8000-000000000003";
const CITY_ID = "10000000-0000-4000-8000-000000000001";
const VENUE_ID = "20000000-0000-4000-8000-000000000002";
const VERSION = "2026-09-08T09:10:11.123456+05:30";
const ROOT = "40000000-0000-4000-8000-000000000004";
const JOB_ID = "50000000-0000-4000-8000-000000000005";
const RATE_SECRET = "unit-test-only-limiter-key-not-a-real-secret";
const TEST_IP = "192.0.2.1";
const PRIVATE_DETAIL = "SQL/internal-provider-detail-that-must-not-reach-the-form";
const ADMIN = { id: ADMIN_ID, display_name: "Test administrator", is_active: true, created_at: VERSION };
type QueryResult = { data: unknown; error: unknown };
type StatefulAction = (previous: ActionState, formData: FormData) => Promise<ActionState>;

function query(result: QueryResult) {
  const pending = Promise.resolve(result);
  const builder = {
    select: vi.fn(), eq: vi.fn(), lte: vi.fn(), order: vi.fn(), limit: vi.fn(), delete: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result), then: pending.then.bind(pending),
  };
  for (const name of ["select", "eq", "lte", "order", "limit", "delete"] as const) builder[name].mockReturnValue(builder);
  return builder;
}

function makeSession() {
  const adminQuery = query({ data: ADMIN, error: null });
  const mediaQuery = query({ data: null, error: null });
  const cleanupQueries: ReturnType<typeof query>[] = [];
  const remove = vi.fn().mockResolvedValue({ data: [], error: null });
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: ADMIN_ID } }, error: null }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: { user: { id: ADMIN_ID }, session: { user: { id: ADMIN_ID } } }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn((table: string) => {
      if (table === "admin_users") return adminQuery;
      if (table === "media_assets") return mediaQuery;
      if (table === "storage_cleanup_jobs") {
        const next = cleanupQueries.shift();
        if (next) return next;
      }
      throw new Error("Unexpected table access in this test");
    }),
    rpc: vi.fn().mockResolvedValue({ data: VENUE_ID, error: null }),
    storage: { from: vi.fn((bucket: string) => {
      if (bucket !== "shagun-media") throw new Error("Unexpected bucket");
      return { remove };
    }) },
  };
  return { client, adminQuery, mediaQuery, cleanupQueries, remove };
}

function form(values: Record<string, string> = {}): FormData {
  const result = new FormData();
  for (const [name, value] of Object.entries(values)) result.set(name, value);
  return result;
}
function cityForm(overrides: Record<string, string> = {}) {
  return form({ id: "", expected_updated_at: "", name: "Test City", slug: "test-city", state: "Jharkhand", country: "India", status: "draft", metadata: "", ...overrides });
}
function venueForm(overrides: Record<string, string> = {}) {
  return form({ id: "", expected_updated_at: "", city_id: CITY_ID, name: "Test Venue", slug: "test-venue", venue_type: "vivah_bhawan", status: "draft", verification_status: "unverified", source_notes: "", ...overrides });
}
function deleteForm(overrides: Record<string, string> = {}) {
  return form({ id: VENUE_ID, expected_updated_at: VERSION, confirm_name: "Test Record", ...overrides });
}
function loginForm(overrides: Record<string, string> = {}) {
  return form({ email: "admin@example.test", password: "test-only-password-never-a-real-credential", ...overrides });
}
function rateKey(scope: string, subject: string) {
  return `${scope}:${createHmac("sha256", RATE_SECRET).update(`${scope}:${subject}`).digest("hex")}`;
}

let session: ReturnType<typeof makeSession>;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("RATE_LIMIT_SECRET", RATE_SECRET);
  mocks.headers.mockResolvedValue(new Headers({ "x-vercel-forwarded-for": TEST_IP }));
  mocks.rateRpc.mockResolvedValue({ data: true, error: null });
  mocks.serviceClient.mockReturnValue({ rpc: mocks.rateRpc });
  mocks.redirect.mockImplementation(() => { throw mocks.redirectSignal; });
  session = makeSession();
  mocks.sessionClient.mockResolvedValue(session.client);
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

const adminActions: Array<[string, StatefulAction]> = [
  ["save city", saveCityAction], ["delete city", deleteCityAction],
  ["save venue", saveVenueAction], ["delete venue", deleteVenueAction],
  ["cleanup", cleanupStorageAction], ["logout", logoutAction],
];

describe("fresh action authorization", () => {
  it.each(adminActions)("denies an unauthenticated %s before validation or mutation", async (_name, action) => {
    session.client.auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: PRIVATE_DETAIL } });
    const result = await action({}, new FormData());
    expect(result.error).toMatch(/sign in again/i);
    expect(JSON.stringify(result)).not.toContain(PRIVATE_DETAIL);
    expect(session.client.from).not.toHaveBeenCalled();
    expect(session.client.rpc).not.toHaveBeenCalled();
    expect(session.remove).not.toHaveBeenCalled();
    expect(session.client.auth.signOut).not.toHaveBeenCalled();
    expect(mocks.rateRpc).not.toHaveBeenCalled();
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it.each([null, { ...ADMIN, is_active: false }, { ...ADMIN, id: CITY_ID }])("denies missing, inactive or mismatched membership: %j", async (admin) => {
    session.adminQuery.maybeSingle.mockResolvedValue({ data: admin, error: null });
    for (const [, action] of adminActions) expect((await action({}, new FormData())).error).toMatch(/sign in again/i);
    expect(session.adminQuery.eq).toHaveBeenCalledWith("id", ADMIN_ID);
    expect(session.adminQuery.eq).toHaveBeenCalledWith("is_active", true);
    expect(session.client.rpc).not.toHaveBeenCalled();
    expect(session.remove).not.toHaveBeenCalled();
    expect(mocks.rateRpc).not.toHaveBeenCalled();
  });

  it("does not reuse a previously authorized action context", async () => {
    session.adminQuery.maybeSingle.mockResolvedValueOnce({ data: ADMIN, error: null }).mockResolvedValueOnce({ data: null, error: null });
    await expect(saveCityAction({}, cityForm())).rejects.toBe(mocks.redirectSignal);
    expect((await saveCityAction({}, cityForm())).error).toMatch(/sign in again/i);
    expect(mocks.sessionClient).toHaveBeenCalledTimes(2);
    expect(session.client.auth.getUser).toHaveBeenCalledTimes(2);
    expect(session.adminQuery.maybeSingle).toHaveBeenCalledTimes(2);
    expect(session.client.rpc).toHaveBeenCalledTimes(1);
  });
});

describe("form validation", () => {
  it("returns city field errors without calling a write", async () => {
    const result = await saveCityAction({}, cityForm({ name: "", metadata: '{"nested":{"not":"allowed"}}' }));
    expect(result.fieldErrors?.name).toBeDefined();
    expect(result.fieldErrors?.metadata).toBeDefined();
    expect(session.client.rpc).not.toHaveBeenCalled();
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("rejects metadata exceeding the UTF-8 byte budget", async () => {
    const metadata = JSON.stringify(Object.fromEntries(["a", "b", "c", "d"].map((key) => [key, "界".repeat(400)])));
    expect((await saveCityAction({}, cityForm({ metadata }))).fieldErrors?.metadata).toBeDefined();
    expect(session.client.rpc).not.toHaveBeenCalled();
  });

  it.each([
    [{ capacity_min: "20", capacity_max: "10" }, "capacity_max"],
    [{ latitude: "23.5" }, "longitude"],
    [{ price_min: "1000", price_type: "" }, "price_type"],
    [{ status: "published" }, "status"],
    [{ reviewed: "on", source_notes: "" }, "source_notes"],
    [{ verified_at: "April 1, 2020" }, "verified_at"],
    [{ verified_at: "2020-02-30" }, "verified_at"],
    [{ verified_at: "2999-01-01" }, "verified_at"],
  ] satisfies Array<[Record<string, string>, string]>)("rejects venue input %j", async (fields, field) => {
    const result = await saveVenueAction({}, venueForm(fields));
    expect(result.fieldErrors?.[field]).toBeDefined();
    expect(session.client.rpc).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("rejects unsupported facilities instead of dropping them", async () => {
    const data = venueForm();
    data.append("facilities", "parking");
    data.append("facilities", "invented-facility");
    expect((await saveVenueAction({}, data)).fieldErrors?.facilities).toBeDefined();
    expect(session.client.rpc).not.toHaveBeenCalled();
  });

  it.each(["duplicate", "file"])("rejects %s scalar form values", async (kind) => {
    const data = cityForm();
    if (kind === "duplicate") data.append("name", "Another city");
    else data.set("name", new Blob(["not a text field"]), "test.txt");
    expect((await saveCityAction({}, data)).fieldErrors?.name).toBeDefined();
    expect(session.client.rpc).not.toHaveBeenCalled();
  });

  it.each(["", "not-a-version", "2026-09-08", "2026-09-08T09:10:11.1234567Z"])("rejects missing/invalid edit and delete versions: %s", async (version) => {
    const results = await Promise.all([
      saveCityAction({}, cityForm({ id: CITY_ID, expected_updated_at: version })),
      saveVenueAction({}, venueForm({ id: VENUE_ID, expected_updated_at: version })),
      deleteCityAction({}, deleteForm({ id: CITY_ID, expected_updated_at: version })),
      deleteVenueAction({}, deleteForm({ expected_updated_at: version })),
    ]);
    for (const result of results) expect(result.fieldErrors?.expected_updated_at).toBeDefined();
    expect(session.client.rpc).not.toHaveBeenCalled();
  });

  it("rejects an invalid or missing identifier paired with an existing version", async () => {
    expect((await saveCityAction({}, cityForm({ id: "invalid-id", expected_updated_at: VERSION }))).fieldErrors?.id).toBeDefined();
    expect((await saveVenueAction({}, venueForm({ expected_updated_at: VERSION }))).fieldErrors?.id).toBeDefined();
    expect(session.client.rpc).not.toHaveBeenCalled();
  });

  it("requires the actual confirm_name field, not the old guessed name field", async () => {
    const result = await deleteVenueAction({}, deleteForm({ confirm_name: "", name: "Test Record" }));
    expect(result.fieldErrors?.confirm_name).toBeDefined();
    expect(session.client.rpc).not.toHaveBeenCalled();
  });
});

describe("atomic saves and redirect control flow", () => {
  it("sends the city payload and exact six-digit timestamp, then returns to its editor", async () => {
    session.client.rpc.mockResolvedValue({ data: CITY_ID, error: null });
    const data = cityForm({ id: CITY_ID, expected_updated_at: VERSION, name: " Test City ", metadata: '{"label":"test","enabled":true}', launched_at: "untrusted", updated_at: "untrusted" });
    await expect(saveCityAction({}, data)).rejects.toBe(mocks.redirectSignal);
    expect(session.client.rpc).toHaveBeenCalledExactlyOnceWith("save_city", {
      p_id: CITY_ID, p_expected: VERSION,
      p_data: { name: "Test City", slug: "test-city", state: "Jharkhand", country: "India", description: null, seo_title: null, seo_description: null, status: "draft", metadata: { label: "test", enabled: true } },
    });
    expect(mocks.redirect).toHaveBeenCalledWith("/admin/cities/test-city/edit");
    expect(mocks.revalidateTag).toHaveBeenCalledWith("inventory", { expire: 0 });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(session.client.rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.revalidateTag.mock.invocationCallOrder[0]);
    expect(mocks.revalidateTag.mock.invocationCallOrder[0]).toBeLessThan(mocks.redirect.mock.invocationCallOrder[0]);
  });

  it("generates a slug only when blank and uses null version/ID for new records", async () => {
    await expect(saveCityAction({}, cityForm({ slug: " " }))).rejects.toBe(mocks.redirectSignal);
    expect(session.client.rpc).toHaveBeenCalledWith("save_city", expect.objectContaining({ p_id: null, p_expected: null, p_data: expect.objectContaining({ slug: "test-city" }) }));
    await expect(saveVenueAction({}, venueForm({ slug: "" }))).rejects.toBe(mocks.redirectSignal);
    expect(session.client.rpc).toHaveBeenCalledWith("save_venue", expect.objectContaining({ p_id: null, p_expected: null, p_data: expect.objectContaining({ slug: "test-venue", reviewed: false, facilities: [] }) }));
  });

  it("sends facilities, research and review in the sole venue RPC and preserves the version", async () => {
    const data = venueForm({
      id: VENUE_ID, expected_updated_at: VERSION, name: " Test Venue ", description: " Recorded hall ",
      locality: "Test locality", address: "Synthetic test address", phone: "+1 (202) 555-0123", email: "public@example.test",
      capacity_min: "100", capacity_max: "500", price_min: "1000", price_max: "2000", price_type: "per_event",
      latitude: "23.99", longitude: "85.37", status: "published", verification_status: "verified", verified_at: "2020-01-02",
      source_notes: " Synthetic test sources ", reviewed: "on", reviewed_by: "untrusted", reviewed_at: "untrusted", published_at: "untrusted",
    });
    for (const facility of ["parking", "ac", "parking"]) data.append("facilities", facility);
    await expect(saveVenueAction({}, data)).rejects.toBe(mocks.redirectSignal);
    expect(session.client.rpc).toHaveBeenCalledExactlyOnceWith("save_venue", {
      p_id: VENUE_ID, p_expected: VERSION,
      p_data: {
        city_id: CITY_ID, name: "Test Venue", slug: "test-venue", description: "Recorded hall", venue_type: "vivah_bhawan",
        locality: "Test locality", address: "Synthetic test address", phone: "+12025550123", alternate_phone: null, whatsapp: null, email: "public@example.test",
        capacity_min: 100, capacity_max: 500, price_min: 1000, price_max: 2000, price_type: "per_event", latitude: 23.99, longitude: 85.37,
        status: "published", verification_status: "verified", verified_at: "2020-01-02", seo_title: null, seo_description: null,
        source_notes: "Synthetic test sources", reviewed: true, facilities: ["parking", "ac"],
      },
    });
    expect(session.client.from.mock.calls.map(([table]) => table)).toEqual(["admin_users"]);
    expect(mocks.redirect).toHaveBeenCalledWith(`/admin/venues/${VENUE_ID}?saved=1`);
  });

  it.each(["2026-09-08T00:01:02.000001Z", "2026-09-08T00:01:02.654321-04:00"])("does not normalize a version's offset or fractional digits: %s", async (version) => {
    await expect(saveVenueAction({}, venueForm({ id: VENUE_ID, expected_updated_at: version }))).rejects.toBe(mocks.redirectSignal);
    expect(session.client.rpc).toHaveBeenCalledWith("save_venue", expect.objectContaining({ p_expected: version }));
  });
});

describe("permanent deletion", () => {
  it.each([
    ["city", deleteCityAction, CITY_ID, "/admin/cities"],
    ["venue", deleteVenueAction, VENUE_ID, "/admin/venues"],
  ] satisfies Array<[string, StatefulAction, string, string]>)("deletes a %s through its confirmed/versioned RPC", async (kind, action, id, target) => {
    session.client.rpc.mockResolvedValue({ data: null, error: null });
    await expect(action({}, deleteForm({ id, name: "ignored", p_kind: "ignored", returnTo: "https://example.test/ignored" }))).rejects.toBe(mocks.redirectSignal);
    expect(session.client.rpc).toHaveBeenCalledExactlyOnceWith("delete_record", { p_kind: kind, p_id: id, p_name: "Test Record", p_expected: VERSION });
    expect(session.client.from.mock.calls.map(([table]) => table)).toEqual(["admin_users"]);
    expect(mocks.redirect).toHaveBeenCalledWith(target);
    expect(mocks.revalidateTag).toHaveBeenCalledWith("inventory", { expire: 0 });
  });

  it("round-trips confirmation whitespace for the database's exact comparison", async () => {
    session.client.rpc.mockResolvedValue({ data: null, error: { code: "23514", message: "name_mismatch", details: PRIVATE_DETAIL } });
    const result = await deleteVenueAction({}, deleteForm({ confirm_name: " Test Record " }));
    expect(session.client.rpc).toHaveBeenCalledWith("delete_record", expect.objectContaining({ p_name: " Test Record " }));
    expect(result.fieldErrors?.confirm_name).toBeDefined();
    expect(JSON.stringify(result)).not.toContain(PRIVATE_DETAIL);
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("reports stale versions without revalidating or redirecting", async () => {
    session.client.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "conflict", details: PRIVATE_DETAIL } });
    expect((await deleteCityAction({}, deleteForm({ id: CITY_ID }))).error).toMatch(/reload/i);
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

describe("login and logout", () => {
  it("uses durable IP/email budgets, preserves password text and checks the newly signed-in client", async () => {
    const otherSession = makeSession();
    mocks.sessionClient.mockResolvedValueOnce(session.client).mockResolvedValue(otherSession.client);
    const password = "  test-only-passphrase-with-significant-spaces  ";
    await expect(loginAction({}, loginForm({ email: "  ADMIN@Example.Test  ", password }))).rejects.toBe(mocks.redirectSignal);
    expect(mocks.rateRpc).toHaveBeenNthCalledWith(1, "consume_rate_limit", { p_key: rateKey("admin-login-ip", TEST_IP), p_limit: 20, p_seconds: 900 });
    expect(mocks.rateRpc).toHaveBeenNthCalledWith(2, "consume_rate_limit", { p_key: rateKey("admin-login-email", "admin@example.test"), p_limit: 5, p_seconds: 900 });
    expect(session.client.auth.signInWithPassword).toHaveBeenCalledWith({ email: "admin@example.test", password });
    expect(mocks.sessionClient).toHaveBeenCalledTimes(1);
    expect(session.client.auth.getUser).not.toHaveBeenCalled();
    expect(session.adminQuery.eq).toHaveBeenCalledWith("id", ADMIN_ID);
    expect(session.adminQuery.eq).toHaveBeenCalledWith("is_active", true);
    expect(otherSession.client.from).not.toHaveBeenCalled();
    expect(session.client.auth.signOut).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith("/admin");
    expect(mocks.rateRpc.mock.invocationCallOrder[1]).toBeLessThan(session.client.auth.signInWithPassword.mock.invocationCallOrder[0]);
  });

  it.each([null, { ...ADMIN, is_active: false }, { ...ADMIN, id: CITY_ID }])("rejects login allowlist result %j and signs out with a generic error", async (admin) => {
    session.adminQuery.maybeSingle.mockResolvedValue({ data: admin, error: null });
    const denied = await loginAction({}, loginForm());
    session.client.auth.signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: { message: PRIVATE_DETAIL } });
    const wrongPassword = await loginAction({}, loginForm());
    expect(denied).toEqual(wrongPassword);
    expect(denied.error).toMatch(/unable to sign in/i);
    expect(JSON.stringify(denied)).not.toContain(PRIVATE_DETAIL);
    expect(session.client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("also signs out when the allowlist query throws, without exposing sign-out failures", async () => {
    session.adminQuery.maybeSingle.mockRejectedValue(new Error(PRIVATE_DETAIL));
    session.client.auth.signOut.mockRejectedValue(new Error(PRIVATE_DETAIL));
    const result = await loginAction({}, loginForm());
    expect(result.error).toMatch(/unable to sign in/i);
    expect(JSON.stringify(result)).not.toContain(PRIVATE_DETAIL);
    expect(session.client.auth.signOut).toHaveBeenCalledOnce();
  });

  it.each(["IP", "email"])("stops before Auth when the %s budget is exhausted", async (budget) => {
    if (budget === "email") mocks.rateRpc.mockResolvedValueOnce({ data: true, error: null });
    mocks.rateRpc.mockResolvedValueOnce({ data: false, error: null });
    expect((await loginAction({}, loginForm())).error).toMatch(/too many attempts/i);
    expect(mocks.sessionClient).not.toHaveBeenCalled();
    expect(session.client.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("fails closed when the durable limiter is unavailable", async () => {
    mocks.rateRpc.mockResolvedValue({ data: null, error: { message: PRIVATE_DETAIL } });
    const result = await loginAction({}, loginForm());
    expect(result.error).toMatch(/temporarily unavailable/i);
    expect(JSON.stringify(result)).not.toContain(PRIVATE_DETAIL);
    expect(mocks.sessionClient).not.toHaveBeenCalled();
  });

  it("fails closed when limiter configuration is absent", async () => {
    vi.stubEnv("RATE_LIMIT_SECRET", "");
    expect((await loginAction({}, loginForm())).error).toMatch(/temporarily unavailable/i);
    expect(mocks.serviceClient).not.toHaveBeenCalled();
    expect(mocks.sessionClient).not.toHaveBeenCalled();
  });

  it("validates login fields without returning the submitted password", async () => {
    const password = "private-test-input".repeat(20);
    const result = await loginAction({}, loginForm({ email: "invalid", password }));
    expect(result.fieldErrors?.email).toBeDefined();
    expect(result.fieldErrors?.password).toBeDefined();
    expect(JSON.stringify(result)).not.toContain(password);
    expect(mocks.rateRpc).toHaveBeenCalledTimes(1);
    expect(mocks.sessionClient).not.toHaveBeenCalled();
  });

  it("supports both the native logout form and useActionState without catching redirects", async () => {
    const nativeLogout: (data: FormData) => Promise<void> = logoutAction;
    await expect(nativeLogout(new FormData())).rejects.toBe(mocks.redirectSignal);
    await expect(logoutAction({}, new FormData())).rejects.toBe(mocks.redirectSignal);
    expect(session.client.auth.getUser).toHaveBeenCalledTimes(2);
    expect(session.client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.redirect).toHaveBeenCalledWith("/admin/login");
  });

  it("returns safe logout feedback to stateful callers and a safe error to the native form", async () => {
    session.client.auth.signOut.mockResolvedValue({ error: { message: PRIVATE_DETAIL } });
    const result = await logoutAction({}, new FormData());
    expect(result.error).toBeDefined();
    expect(JSON.stringify(result)).not.toContain(PRIVATE_DETAIL);
    await expect(logoutAction(new FormData())).rejects.toThrow(result.error);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

describe("bounded session-authorized storage cleanup", () => {
  const now = "2026-09-08T12:00:00.000Z";
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(now));
  });

  it("removes all three root variants before acknowledging the job with the session client", async () => {
    const read = query({ data: [{ id: JOB_ID, storage_key: ROOT }], error: null });
    const acknowledge = query({ data: { id: JOB_ID }, error: null });
    session.cleanupQueries.push(read, acknowledge);
    const result = await cleanupStorageAction({}, new FormData());
    expect(result.success).toBe(true);
    expect(read.select).toHaveBeenCalledWith("id,storage_key");
    expect(read.lte).toHaveBeenCalledExactlyOnceWith("ready_at", now);
    expect(read.order.mock.calls).toEqual([["ready_at"], ["id"]]);
    expect(read.limit).toHaveBeenCalledWith(25);
    expect(session.mediaQuery.select).toHaveBeenCalledWith("id");
    expect(session.mediaQuery.eq).toHaveBeenCalledWith("storage_key", ROOT);
    expect(session.mediaQuery.maybeSingle).toHaveBeenCalledOnce();
    expect(session.client.storage.from).toHaveBeenCalledWith("shagun-media");
    expect(session.remove).toHaveBeenCalledExactlyOnceWith([`${ROOT}/480.webp`, `${ROOT}/960.webp`, `${ROOT}/1600.webp`]);
    expect(acknowledge.delete).toHaveBeenCalledOnce();
    expect(acknowledge.eq).toHaveBeenCalledWith("id", JOB_ID);
    expect(acknowledge.eq).toHaveBeenCalledWith("storage_key", ROOT);
    expect(session.mediaQuery.maybeSingle.mock.invocationCallOrder[0]).toBeLessThan(session.remove.mock.invocationCallOrder[0]);
    expect(session.remove.mock.invocationCallOrder[0]).toBeLessThan(acknowledge.delete.mock.invocationCallOrder[0]);
    expect(mocks.rateRpc).toHaveBeenCalledWith("consume_rate_limit", { p_key: rateKey("admin-storage-cleanup", ADMIN_ID), p_limit: 5, p_seconds: 60 });
    expect(mocks.revalidateTag).toHaveBeenCalledWith("inventory", { expire: 0 });
  });

  it("does not clean future reservations and includes jobs ready exactly at the cutoff", async () => {
    const future = { id: "50000000-0000-4000-8000-000000000007", storage_key: "40000000-0000-4000-8000-000000000007", ready_at: "2026-09-08T12:15:00.000Z" };
    const ready = { id: JOB_ID, storage_key: ROOT, ready_at: now };
    const read = query({ data: [future, ready], error: null });
    const eligible = query({ data: [ready], error: null });
    // Model PostgREST's filtered result separately: merely calling (but not
    // chaining) lte, or removing the predicate, must not process the future job.
    read.lte.mockReturnValue(eligible);
    const acknowledge = query({ data: { id: JOB_ID }, error: null });
    session.cleanupQueries.push(read, acknowledge);
    const result = await cleanupStorageAction({}, new FormData());
    expect(result.success).toBe(true);
    expect(read.lte).toHaveBeenCalledExactlyOnceWith("ready_at", now);
    expect(eligible.order.mock.calls).toEqual([["ready_at"], ["id"]]);
    expect(eligible.limit).toHaveBeenCalledWith(25);
    expect(session.mediaQuery.eq.mock.calls).toEqual([["storage_key", ROOT]]);
    expect(session.remove).toHaveBeenCalledExactlyOnceWith([`${ROOT}/480.webp`, `${ROOT}/960.webp`, `${ROOT}/1600.webp`]);
    expect(acknowledge.eq).not.toHaveBeenCalledWith("id", future.id);
    expect(JSON.stringify(result)).not.toContain(future.storage_key);
  });

  it.each(["live reference", "query error", "query rejection"])("keeps a job without touching Storage on a %s", async (reason) => {
    session.cleanupQueries.push(query({ data: [{ id: JOB_ID, storage_key: ROOT }], error: null }));
    if (reason === "live reference") session.mediaQuery.maybeSingle.mockResolvedValueOnce({ data: { id: VENUE_ID }, error: null });
    else if (reason === "query error") session.mediaQuery.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: PRIVATE_DETAIL } });
    else session.mediaQuery.maybeSingle.mockRejectedValueOnce(new Error(PRIVATE_DETAIL));
    const result = await cleanupStorageAction({}, new FormData());
    expect(result.error).toMatch(/remain queued/i);
    expect(result.success).not.toBe(true);
    expect(session.mediaQuery.select).toHaveBeenCalledWith("id");
    expect(session.mediaQuery.eq).toHaveBeenCalledWith("storage_key", ROOT);
    expect(session.client.storage.from).not.toHaveBeenCalled();
    expect(session.remove).not.toHaveBeenCalled();
    expect(session.client.from.mock.calls.filter(([table]) => table === "storage_cleanup_jobs")).toHaveLength(1);
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(PRIVATE_DETAIL);
    expect(JSON.stringify(result)).not.toContain(ROOT);
  });

  it("continues past a live reference while leaving its job for investigation", async () => {
    const otherRoot = "40000000-0000-4000-8000-000000000006";
    const otherJob = "50000000-0000-4000-8000-000000000006";
    const acknowledge = query({ data: { id: otherJob }, error: null });
    session.cleanupQueries.push(query({ data: [{ id: JOB_ID, storage_key: ROOT }, { id: otherJob, storage_key: otherRoot }], error: null }), acknowledge);
    session.mediaQuery.maybeSingle.mockResolvedValueOnce({ data: { id: VENUE_ID }, error: null });
    const result = await cleanupStorageAction({}, new FormData());
    expect(result.error).toMatch(/1 cleanup job completed; 1/i);
    expect(session.mediaQuery.eq.mock.calls).toEqual([["storage_key", ROOT], ["storage_key", otherRoot]]);
    expect(session.remove).toHaveBeenCalledExactlyOnceWith([`${otherRoot}/480.webp`, `${otherRoot}/960.webp`, `${otherRoot}/1600.webp`]);
    expect(acknowledge.eq).toHaveBeenCalledWith("id", otherJob);
    expect(acknowledge.eq).not.toHaveBeenCalledWith("id", JOB_ID);
    expect(mocks.revalidateTag).toHaveBeenCalledOnce();
  });

  it.each(["error response", "rejection"])("keeps the job on a Storage %s", async (failure) => {
    session.cleanupQueries.push(query({ data: [{ id: JOB_ID, storage_key: ROOT }], error: null }));
    if (failure === "rejection") session.remove.mockRejectedValue(new Error(PRIVATE_DETAIL));
    else session.remove.mockResolvedValue({ data: null, error: { message: PRIVATE_DETAIL } });
    const result = await cleanupStorageAction({}, new FormData());
    expect(result.error).toMatch(/remain queued/i);
    expect(result.success).not.toBe(true);
    expect(JSON.stringify(result)).not.toContain(PRIVATE_DETAIL);
    expect(session.client.from.mock.calls.filter(([table]) => table === "storage_cleanup_jobs")).toHaveLength(1);
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it.each([{ data: null, error: { message: PRIVATE_DETAIL } }, { data: null, error: null }])("does not report success for an unacknowledged/RLS-filtered job: %j", async (acknowledgment) => {
    session.cleanupQueries.push(query({ data: [{ id: JOB_ID, storage_key: ROOT }], error: null }), query(acknowledgment));
    const result = await cleanupStorageAction({}, new FormData());
    expect(result.error).toMatch(/remain queued/i);
    expect(result.success).not.toBe(true);
    expect(JSON.stringify(result)).not.toContain(PRIVATE_DETAIL);
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("continues after one failed root, acknowledges only the successful root and invalidates partial progress", async () => {
    const otherRoot = "40000000-0000-4000-8000-000000000006";
    const otherJob = "50000000-0000-4000-8000-000000000006";
    const acknowledge = query({ data: { id: otherJob }, error: null });
    session.cleanupQueries.push(query({ data: [{ id: JOB_ID, storage_key: ROOT }, { id: otherJob, storage_key: otherRoot }], error: null }), acknowledge);
    session.remove.mockResolvedValueOnce({ data: null, error: { message: PRIVATE_DETAIL } }).mockResolvedValueOnce({ data: [], error: null });
    const result = await cleanupStorageAction({}, new FormData());
    expect(result.error).toMatch(/1 cleanup job completed; 1/i);
    expect(session.remove).toHaveBeenCalledTimes(2);
    expect(acknowledge.eq).toHaveBeenCalledWith("id", otherJob);
    expect(acknowledge.eq).not.toHaveBeenCalledWith("id", JOB_ID);
    expect(mocks.revalidateTag).toHaveBeenCalledOnce();
  });

  it("never processes more than 25 roots in one action", async () => {
    const jobs = Array.from({ length: 26 }, (_, index) => ({
      id: `50000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      storage_key: `40000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    }));
    const read = query({ data: jobs, error: null });
    session.cleanupQueries.push(read, ...jobs.slice(0, 25).map((job) => query({ data: { id: job.id }, error: null })));
    expect((await cleanupStorageAction({}, new FormData())).success).toBe(true);
    expect(read.limit).toHaveBeenCalledWith(25);
    expect(session.remove).toHaveBeenCalledTimes(25);
    expect(session.remove).not.toHaveBeenCalledWith(expect.arrayContaining([`${jobs[25].storage_key}/480.webp`]));
  });

  it("does not attempt arbitrary paths if an invalid root is returned", async () => {
    session.cleanupQueries.push(query({ data: [{ id: JOB_ID, storage_key: "../unrelated" }], error: null }));
    expect((await cleanupStorageAction({}, new FormData())).error).toMatch(/remain queued/i);
    expect(session.remove).not.toHaveBeenCalled();
  });

  it("stops before reading jobs when the durable cleanup budget is exhausted", async () => {
    mocks.rateRpc.mockResolvedValue({ data: false, error: null });
    expect((await cleanupStorageAction({}, new FormData())).error).toMatch(/too many attempts/i);
    expect(session.client.from.mock.calls.map(([table]) => table)).toEqual(["admin_users"]);
    expect(session.remove).not.toHaveBeenCalled();
  });

  it("handles an unavailable queue without deleting any objects", async () => {
    session.cleanupQueries.push(query({ data: null, error: { message: PRIVATE_DETAIL } }));
    const result = await cleanupStorageAction({}, new FormData());
    expect(result.error).toBeDefined();
    expect(JSON.stringify(result)).not.toContain(PRIVATE_DETAIL);
    expect(session.remove).not.toHaveBeenCalled();
  });

  it("returns readiness feedback when no jobs are eligible", async () => {
    const read = query({ data: [], error: null });
    session.cleanupQueries.push(read);
    expect(await cleanupStorageAction({}, new FormData())).toEqual({ success: true, message: "No cleanup jobs are ready. Incomplete uploads become eligible after 15 minutes." });
    expect(read.lte).toHaveBeenCalledExactlyOnceWith("ready_at", now);
    expect(session.client.from.mock.calls.map(([table]) => table)).toEqual(["admin_users", "storage_cleanup_jobs"]);
    expect(session.remove).not.toHaveBeenCalled();
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });
});

describe("safe errors and route-compatible invalidation", () => {
  it.each([
    ["23514", "city_slug_locked", "slug"], ["23514", "venue_url_locked", "city_id"],
    ["23514", "city_requires_published_venue", "status"], ["23514", "editorial_review_required", "reviewed"],
    ["23514", "verification_requires_fresh_review", "verified_at"], ["22023", "invalid_facilities", "facilities"],
    ["22007", "iso_date_required", "verified_at"],
  ])("maps the safe sentinel %s:%s to a form field", (code, message, field) => {
    const result = actionError({ code, message, details: PRIVATE_DETAIL, hint: PRIVATE_DETAIL });
    expect(result.fieldErrors?.[field]).toBeDefined();
    expect(JSON.stringify(result)).not.toContain(PRIVATE_DETAIL);
  });

  it("maps uniqueness and relationship codes without exposing constraint names", () => {
    expect(actionError({ code: "23505", message: PRIVATE_DETAIL }, "save_city").fieldErrors?.slug).toBeDefined();
    expect(actionError({ code: "23503", message: PRIVATE_DETAIL }, "delete_city").error).toMatch(/contains venues/i);
    expect(actionError({ code: "23503", message: PRIVATE_DETAIL }, "save_venue").fieldErrors?.city_id).toBeDefined();
  });

  it.each([new Error(PRIVATE_DETAIL), { code: "XX000", message: PRIVATE_DETAIL, details: PRIVATE_DETAIL }, null])("redacts unknown failures: %j", (error) => {
    expect(actionError(error)).toEqual({ error: "The request could not be completed. Please try again." });
  });

  it("expires the inventory tag immediately and invalidates public/admin layout descendants", () => {
    invalidateInventory();
    expect(mocks.revalidateTag).toHaveBeenCalledExactlyOnceWith("inventory", { expire: 0 });
    expect(mocks.revalidatePath).toHaveBeenCalledExactlyOnceWith("/", "layout");
  });
});