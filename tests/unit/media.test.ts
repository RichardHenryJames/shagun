import { createHmac } from "node:crypto";
import sharp from "sharp";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type RpcResult = { data: unknown; error: { message: string } | null };
const mocks = vi.hoisted(() => ({
  getAdminContext: vi.fn<() => Promise<unknown>>(),
  headers: vi.fn<() => Promise<Headers>>(), serviceClient: vi.fn(),
  rpc: vi.fn<(name: string, args: Record<string, unknown>) => Promise<RpcResult>>(),
  fetch: vi.fn<typeof fetch>(),
}));
vi.mock("@/lib/auth", () => ({ getAdminContext: mocks.getAdminContext }));
vi.mock("@/lib/db/clients", () => ({ serviceClient: mocks.serviceClient }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));

import { imageResponse, MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS, MAX_UPLOAD_BODY, MEDIA_BUCKET, MEDIA_WIDTHS, mediaAdmin, mediaFailure, mediaWidth, prepareImage } from "@/lib/media";
import { MEDIA_BUCKET as SCHEMA_MEDIA_BUCKET } from "@/lib/db/schema";
import { assertBodyLimit, assertSameOrigin, enforceRateLimit, HttpError, readBoundedBody, readBoundedFormData, readBoundedJson, requestFingerprint, routeError } from "@/lib/security";

const SITE = "https://shagun.example.test";
const PRIVATE_DETAIL = "synthetic-private-provider-detail";
const SECRET = "unit-test-only-hmac-key-not-a-real-secret";
const IP = "192.0.2.10";
let png: Buffer;

// All image bytes are generated in memory. No photographs, fixture modules or files.
function swatch(width = 32, height = 16) {
  return sharp({ create: { width, height, channels: 3, background: { r: 32, g: 96, b: 160 } } });
}
function bodyRequest(body: BodyInit | null, headers: HeadersInit = {}) {
  return new Request(`${SITE}/api/test`, { method: "POST", body, headers });
}
function streamedRequest(chunks: Uint8Array[], headers: HeadersInit = {}, close = true) {
  const cancel = vi.fn();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk));
      if (close) controller.close();
    },
    cancel,
  });
  const init: RequestInit & { duplex: "half" } = { method: "POST", body: stream, headers, duplex: "half" };
  return { request: new Request(`${SITE}/api/test`, init), cancel };
}

beforeAll(async () => { png = await swatch().png().toBuffer(); });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("RATE_LIMIT_SECRET", SECRET);
  mocks.headers.mockResolvedValue(new Headers({ "x-vercel-forwarded-for": IP }));
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.serviceClient.mockReturnValue({ rpc: mocks.rpc });
  mocks.fetch.mockImplementation(() => { throw new Error("Network access is forbidden in unit tests."); });
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  expect(mocks.fetch).not.toHaveBeenCalled();
});

describe("real Sharp image processing", () => {
  it("fixes the byte/pixel budgets and permits only the three exact width strings", () => {
    expect(MEDIA_BUCKET).toBe("shagun-media");
    expect(MEDIA_BUCKET).toBe(SCHEMA_MEDIA_BUCKET);
    expect(MEDIA_WIDTHS).toEqual([480, 960, 1600]);
    expect(MAX_IMAGE_BYTES).toBe(3 * 1024 * 1024);
    expect(MAX_UPLOAD_BODY).toBe(3 * 1024 * 1024 + 64 * 1024);
    expect(MAX_IMAGE_PIXELS).toBe(40_000_000);
    expect(["480", "960", "1600"].map(mediaWidth)).toEqual([480, 960, 1600]);
    for (const value of ["", "0", "320", "0480", "480.0", " 960", "1601", "960.webp", "../960", "../../private"]) {
      expect(() => mediaWidth(value), value).toThrow(expect.objectContaining({ status: 404 }));
    }
  });

  it.each(["jpeg", "png", "webp"] as const)("decodes genuine %s, strips metadata and never enlarges a small image", async (format) => {
    const input = await swatch().withMetadata({ density: 144, orientation: 1 }).toFormat(format).toBuffer();
    const original = await sharp(input).metadata();
    expect(original.format).toBe(format);
    // Prove that the metadata assertions below are not vacuous.
    expect(original.exif).toBeDefined();
    expect(original.icc).toBeDefined();
    const image = await prepareImage(input, `image/${format}`);
    expect(image).toMatchObject({ width: 32, height: 16 });
    expect(image.variants.map((variant) => variant.width)).toEqual([480, 960, 1600]);
    for (const variant of image.variants) {
      expect(variant.bytes.byteLength).toBeGreaterThan(0);
      const metadata = await sharp(variant.bytes).metadata();
      expect(metadata).toMatchObject({ format: "webp", width: 32, height: 16, hasProfile: false });
      for (const key of ["exif", "icc", "iptc", "xmp", "orientation"] as const) expect(metadata[key]).toBeUndefined();
    }
  });

  it("resizes to 480/960/1600 with the original aspect ratio and reports the largest output", async () => {
    const input = await swatch(2000, 200).png().toBuffer();
    const image = await prepareImage(input, "image/png");
    expect(image).toMatchObject({ width: 1600, height: 160 });
    const dimensions = await Promise.all(image.variants.map(async ({ bytes }) => {
      const metadata = await sharp(bytes).metadata();
      return [metadata.width, metadata.height];
    }));
    expect(dimensions).toEqual([[480, 48], [960, 96], [1600, 160]]);
  });

  it("applies EXIF rotation before stripping orientation", async () => {
    const input = await swatch(12, 6).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    expect((await sharp(input).metadata()).orientation).toBe(6);
    const image = await prepareImage(input, "image/jpeg");
    expect(image).toMatchObject({ width: 6, height: 12 });
    for (const { bytes } of image.variants) {
      const metadata = await sharp(bytes).metadata();
      expect(metadata).toMatchObject({ width: 6, height: 12 });
      expect(metadata.orientation).toBeUndefined();
      expect(metadata.exif).toBeUndefined();
    }
  });

  it("rejects malformed bytes, MIME mismatches, unsupported types and disguised SVG", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2"/></svg>');
    for (const [bytes, mime] of [
      [Buffer.from("not an image"), "image/jpeg"], [png, "image/jpeg"],
      [png, "application/octet-stream"], [png, "constructor"],
      [svg, "image/svg+xml"], [svg, "image/png"],
    ] as const) {
      await expect(prepareImage(bytes, mime), mime).rejects.toMatchObject({ status: 415 });
    }
  });

  it("rejects an actual two-frame WebP even when its MIME matches", async () => {
    const pixels = Buffer.from([255, 0, 0, 255, 0, 0, 0, 0, 255, 0, 0, 255]);
    const animated = await sharp(pixels, { raw: { width: 2, height: 2, channels: 3, pageHeight: 1 }, animated: true })
      .webp({ lossless: true, loop: 0, delay: [100, 100] }).toBuffer();
    expect(await sharp(animated, { animated: true }).metadata()).toMatchObject({ format: "webp", pages: 2 });
    await expect(prepareImage(animated, "image/webp")).rejects.toMatchObject({ status: 415, message: expect.stringMatching(/non-animated/) });
  });

  it("rejects empty images and more than 3 MiB before decoding", async () => {
    for (const bytes of [new Uint8Array(), new Uint8Array(3 * 1024 * 1024 + 1)]) {
      await expect(prepareImage(bytes, "image/png")).rejects.toMatchObject({ status: 413, message: "Choose a nonempty image up to 3 MB." });
    }
  });

  it("rejects a side longer than 20,000 pixels, even below the total-pixel budget", async () => {
    const input = await swatch(20_001, 1).png().toBuffer();
    expect(input.byteLength).toBeLessThan(MAX_IMAGE_BYTES);
    await expect(prepareImage(input, "image/png")).rejects.toMatchObject({ status: 413, message: expect.stringMatching(/too many pixels/) });
  });

  it("enforces Sharp's 40-megapixel input ceiling on a small compressed synthetic PNG", async () => {
    const input = await swatch(8000, 5001).png().toBuffer();
    expect(input.byteLength).toBeLessThan(MAX_IMAGE_BYTES);
    expect(await sharp(input).metadata()).toMatchObject({ width: 8000, height: 5001 });
    // Current implementation maps Sharp's own pixel-limit exception to 415.
    await expect(prepareImage(input, "image/png")).rejects.toMatchObject({ status: 415, message: expect.stringMatching(/safely decoded/) });
  });
});

describe("media authorization, errors and image responses", () => {
  it("requires a fresh admin context and returns only that context", async () => {
    const context = { client: { testOnly: true }, admin: { id: "30000000-0000-4000-8000-000000000003" } };
    mocks.getAdminContext.mockResolvedValueOnce(context).mockResolvedValueOnce(null);
    await expect(mediaAdmin()).resolves.toBe(context);
    await expect(mediaAdmin()).rejects.toMatchObject({ status: 401 });
    expect(mocks.getAdminContext).toHaveBeenCalledTimes(2);
    expect(mocks.serviceClient).not.toHaveBeenCalled();
  });

  it("maps known media failures and never returns arbitrary provider messages", () => {
    const cases: Array<[{ code?: string; message?: string }, number, RegExp]> = [
      [{ code: "42501", message: PRIVATE_DETAIL }, 403, /access has changed/],
      [{ code: "P0002", message: PRIVATE_DETAIL }, 404, /no longer available/],
      [{ message: "photo_limit" }, 409, /one city cover or 24 venue photos/],
      [{ code: "23503", message: PRIVATE_DETAIL }, 409, /city or venue has changed/],
      [{ message: "upload_expired" }, 409, /upload expired/],
      [{ code: "unexpected", message: PRIVATE_DETAIL }, 503, /queued for cleanup/],
    ];
    for (const [error, status, message] of cases) {
      const failure = mediaFailure(error);
      expect(failure).toBeInstanceOf(HttpError);
      expect(failure).toMatchObject({ status, message: expect.stringMatching(message) });
      expect(failure.message).not.toContain(PRIVATE_DETAIL);
    }
  });

  it("streams bytes or a Blob as WebP, with private caching unless explicitly overridden", async () => {
    const bytes = await swatch(2, 1).webp().toBuffer();
    for (const response of [imageResponse(bytes), imageResponse(new Blob([new Uint8Array(bytes)]), "public, max-age=60")]) {
      expect(response.headers.get("content-type")).toBe("image/webp");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("location")).toBeNull();
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array(bytes));
    }
    expect(imageResponse(bytes).headers.get("cache-control")).toBe("private, no-store");
    expect(imageResponse(bytes, "public, max-age=60").headers.get("cache-control")).toBe("public, max-age=60");
  });
});

describe("same-origin and bounded request parsing", () => {
  it("requires the configured origin, rejects cross-site hints and accepts same-origin browser hints", () => {
    for (const hint of [undefined, "same-origin", "none"]) {
      const headers = new Headers({ origin: SITE });
      if (hint) headers.set("sec-fetch-site", hint);
      expect(() => assertSameOrigin(bodyRequest(null, headers))).not.toThrow();
    }
    const rejectedHeaders: HeadersInit[] = [
      {}, { origin: "https://other.example.test" }, { origin: "http://shagun.example.test" },
      { origin: SITE, "sec-fetch-site": "cross-site" }, { origin: SITE, "sec-fetch-site": "same-site" },
    ];
    for (const headers of rejectedHeaders) expect(() => assertSameOrigin(bodyRequest(null, headers))).toThrow(expect.objectContaining({ status: 403 }));
    expect(mocks.headers).not.toHaveBeenCalled();
    expect(mocks.serviceClient).not.toHaveBeenCalled();
  });

  it("concatenates streamed chunks at the exact byte limit without Content-Length", async () => {
    const { request } = streamedRequest([new TextEncoder().encode("é"), new TextEncoder().encode("ok")]);
    expect(request.headers.has("content-length")).toBe(false);
    await expect(readBoundedBody(request, 4)).resolves.toEqual(new TextEncoder().encode("éok"));
    expect(request.body?.locked).toBe(false);
  });

  it.each([undefined, "0"])("bounds actual streamed bytes with declared length %s and cancels overflow", async (length) => {
    const headers = new Headers();
    if (length !== undefined) headers.set("content-length", length);
    const { request, cancel } = streamedRequest([new Uint8Array(2), new Uint8Array(3)], headers, false);
    expect(() => assertBodyLimit(request, 4)).not.toThrow();
    await expect(readBoundedBody(request, 4)).rejects.toMatchObject({ status: 413 });
    expect(cancel).toHaveBeenCalledOnce();
    expect(request.body?.locked).toBe(false);
  });

  it("rejects invalid or excessive declared lengths without consuming the body", async () => {
    for (const length of ["-1", "NaN", "Infinity", "5"]) {
      const request = bodyRequest("data", { "content-length": length });
      await expect(readBoundedBody(request, 4)).rejects.toMatchObject({ status: 413 });
      expect(request.bodyUsed).toBe(false);
    }
  });

  it("handles absent bodies and stream failures without leaking the source error", async () => {
    await expect(readBoundedBody(bodyRequest(null), 4)).rejects.toMatchObject({ status: 400, message: "The request is empty." });
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error(PRIVATE_DETAIL)); } });
    const init: RequestInit & { duplex: "half" } = { method: "POST", body: stream, duplex: "half" };
    const request = new Request(`${SITE}/api/test`, init);
    await expect(readBoundedBody(request, 4)).rejects.toMatchObject({ status: 400, message: "The request could not be read." });
    expect(request.body?.locked).toBe(false);
  });

  it("parses JSON but rejects malformed JSON, invalid UTF-8 and non-JSON content types", async () => {
    await expect(readBoundedJson(bodyRequest('{"value":"é"}', { "content-type": "application/json; charset=utf-8" }))).resolves.toEqual({ value: "é" });
    await expect(readBoundedJson(bodyRequest("{}", { "content-type": "text/plain" }))).rejects.toMatchObject({ status: 415 });
    const invalidUtf8 = new Uint8Array(Buffer.concat([Buffer.from('{"value":"'), Buffer.from([0xff]), Buffer.from('"}')]));
    for (const body of ["{", invalidUtf8]) {
      await expect(readBoundedJson(bodyRequest(body, { "content-type": "application/json" }))).rejects.toMatchObject({ status: 400 });
    }
    const headers = { "content-type": "application/json", "content-length": "0" };
    await expect(readBoundedJson(bodyRequest(" ".repeat(2046) + "{}", headers))).resolves.toEqual({});
    await expect(readBoundedJson(bodyRequest(" ".repeat(2047) + "{}", headers))).rejects.toMatchObject({ status: 413 });
  });

  it("parses a real multipart file at the exact encoded-body limit, not just the file size", async () => {
    const form = new FormData();
    form.set("file", new Blob([new Uint8Array(png)], { type: "image/png" }), "synthetic.png");
    form.set("alt_text", "Synthetic blue rectangle");
    const request = bodyRequest(form);
    const size = (await request.clone().arrayBuffer()).byteLength;
    expect(size).toBeGreaterThan(png.byteLength);
    expect(request.headers.has("content-length")).toBe(false);
    const parsed = await readBoundedFormData(request, size);
    expect(parsed.get("alt_text")).toBe("Synthetic blue rectangle");
    const file = parsed.get("file");
    expect(file).toBeInstanceOf(File);
    if (!(file instanceof File)) throw new Error("Expected the synthetic multipart file.");
    expect(file.name).toBe("synthetic.png");
    expect(file.type).toBe("image/png");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array(png));
    // Incoming HTTP requests contain encoded bytes, not undici's outgoing FormData
    // generator (whose asynchronous close can race cancellation in Node tests).
    const encodedRequest = bodyRequest(form);
    const encoded = new Uint8Array(await encodedRequest.arrayBuffer());
    const incoming = bodyRequest(encoded, { "content-type": encodedRequest.headers.get("content-type")! });
    await expect(readBoundedFormData(incoming, png.byteLength)).rejects.toMatchObject({ status: 413 });
  });

  it("rejects malformed multipart framing and incorrect content types", async () => {
    await expect(readBoundedFormData(bodyRequest("broken", { "content-type": "multipart/form-data;" }), 100)).rejects.toMatchObject({ status: 400 });
    await expect(readBoundedFormData(bodyRequest("broken", { "content-type": "multipart/form-data; boundary=missing" }), 100)).rejects.toMatchObject({ status: 400 });
    await expect(readBoundedFormData(bodyRequest("{}", { "content-type": "application/json" }), 100)).rejects.toMatchObject({ status: 415 });
  });
});

describe("durable rate limiting and sanitized route failures", () => {
  it("uses only the trusted Vercel IP and sends a scoped HMAC to the durable RPC", async () => {
    vi.stubEnv("VERCEL", "1");
    mocks.headers.mockResolvedValue(new Headers({ "x-vercel-forwarded-for": ` ${IP}, 198.51.100.20`, "x-forwarded-for": "203.0.113.30" }));
    const fingerprint = await requestFingerprint();
    expect(fingerprint).toBe(IP);
    await enforceRateLimit("public-events", fingerprint, 60, 60);
    const digest = createHmac("sha256", SECRET).update(`public-events:${IP}`).digest("hex");
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("consume_rate_limit", { p_key: `public-events:${digest}`, p_limit: 60, p_seconds: 60 });
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain(IP);
  });

  it("uses a local bucket for explicit loopback HTTP and never falls back when Vercel's trusted header is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    mocks.headers.mockResolvedValue(new Headers({ "x-forwarded-for": IP }));
    await expect(requestFingerprint()).resolves.toBe("local");
    expect(mocks.headers).not.toHaveBeenCalled();
    vi.stubEnv("VERCEL", "1");
    await expect(requestFingerprint()).rejects.toMatchObject({ status: 503 });
    expect(mocks.serviceClient).not.toHaveBeenCalled();
  });

  it("fails closed outside Vercel for remote, invalid or non-HTTP loopback origins regardless of forwarding headers", async () => {
    mocks.headers.mockResolvedValue(new Headers({ "x-vercel-forwarded-for": IP, "x-forwarded-for": IP, "x-real-ip": IP }));
    for (const origin of [SITE, "http://shagun.example.test", "https://localhost:3000", "http://localhost.example.test:3000", "not-an-origin"]) {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", origin);
      await expect(requestFingerprint()).rejects.toMatchObject({ status: 503, message: "The service cannot accept this request right now." });
    }
    expect(mocks.headers).not.toHaveBeenCalled();
    expect(mocks.serviceClient).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("accepts the trusted header's IPv6 value without changing the limiter subject", async () => {
    vi.stubEnv("VERCEL", "1");
    const ipv6 = "2001:db8::10";
    mocks.headers.mockResolvedValue(new Headers({ "x-vercel-forwarded-for": ` ${ipv6}, ${IP}`, "x-forwarded-for": IP }));
    const fingerprint = await requestFingerprint();
    expect(fingerprint).toBe(ipv6);
    await enforceRateLimit("public-events", fingerprint, 60, 60);
    const digest = createHmac("sha256", SECRET).update(`public-events:${ipv6}`).digest("hex");
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("consume_rate_limit", { p_key: `public-events:${digest}`, p_limit: 60, p_seconds: 60 });
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain(ipv6);
  });

  it("rejects invalid trusted IPs without trusting another header, list entry or exposing their values", async () => {
    vi.stubEnv("VERCEL", "1");
    for (const value of ["", PRIVATE_DETAIL, "999.0.2.10", `${IP}:443`, "[2001:db8::10]", "2001:db8::invalid", `, ${IP}`, `${PRIVATE_DETAIL}, ${IP}`]) {
      mocks.headers.mockResolvedValue(new Headers({ "x-vercel-forwarded-for": value, "x-forwarded-for": IP }));
      await expect(requestFingerprint()).rejects.toMatchObject({ status: 503, message: "The service cannot accept this request right now." });
    }
    expect(mocks.serviceClient).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("fails closed for exhausted budgets, provider failures and missing/short HMAC secrets", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null }).mockResolvedValueOnce({ data: null, error: { message: PRIVATE_DETAIL } });
    await expect(enforceRateLimit("public-events", IP, 60, 60)).rejects.toMatchObject({ status: 429 });
    await expect(enforceRateLimit("public-events", IP, 60, 60)).rejects.toMatchObject({ status: 503, message: "The service is temporarily unavailable. Please try again later." });
    mocks.serviceClient.mockClear();
    for (const secret of ["", "x".repeat(31)]) {
      vi.stubEnv("RATE_LIMIT_SECRET", secret);
      await expect(enforceRateLimit("public-events", IP, 60, 60)).rejects.toMatchObject({ status: 503 });
    }
    expect(mocks.serviceClient).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  it("keeps failures private, sanitizes unknown errors and adds Retry-After only to 429", async () => {
    const unknown = routeError(new Error(PRIVATE_DETAIL));
    expect(unknown.status).toBe(500);
    expect(unknown.headers.get("cache-control")).toBe("private, no-store");
    expect(unknown.headers.get("retry-after")).toBeNull();
    await expect(unknown.json()).resolves.toEqual({ error: "The request could not be completed. Please try again." });
    const limited = routeError(new HttpError(429, "Synthetic rate limit"));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    expect(limited.headers.get("cache-control")).toBe("private, no-store");
    await expect(limited.json()).resolves.toEqual({ error: "Synthetic rate limit" });
  });
});