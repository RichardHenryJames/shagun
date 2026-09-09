import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { headers } from "next/headers";
import { isLocalHttpOrigin, siteUrl } from "@/lib/config";
import { serviceClient } from "@/lib/db/clients";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!origin || origin !== new URL(siteUrl()).origin || (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none")) {
    throw new HttpError(403, "This request must come from this website.");
  }
}
export function assertBodyLimit(request: Request, maxBytes: number) {
  const length = Number(request.headers.get("content-length"));
  if (!Number.isFinite(length) || length < 0 || length > maxBytes) throw new HttpError(413, "The request is too large.");
}
export async function readBoundedBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  assertBodyLimit(request, maxBytes);
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "The request is empty.");
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) { await reader.cancel(); throw new HttpError(413, "The request is too large."); }
      chunks.push(value);
    }
    return new Uint8Array(Buffer.concat(chunks));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "The request could not be read.");
  } finally {
    reader.releaseLock();
  }
}

export async function readBoundedJson(request: Request, maxBytes = 2048): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new HttpError(415, "Send a JSON request.");
  const bytes = await readBoundedBody(request, maxBytes);
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new HttpError(400, "The request could not be read."); }
}

export async function readBoundedFormData(request: Request, maxBytes: number): Promise<FormData> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;/i.test(contentType)) throw new HttpError(415, "Send a multipart image upload.");
  const bytes = await readBoundedBody(request, maxBytes);
  try { return await new Response(new Uint8Array(bytes), { headers: { "Content-Type": contentType } }).formData(); }
  catch { throw new HttpError(400, "The upload could not be read. Choose the file again."); }
}

export async function requestFingerprint(): Promise<string> {
  if (process.env.VERCEL) {
    const h = await headers();
    // Vercel sanitizes this header; do not trust arbitrary X-Forwarded-For elsewhere.
    const ip = h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
    if (ip && isIP(ip)) return ip;
  } else {
    try { if (isLocalHttpOrigin(siteUrl())) return "local"; }
    catch { /* Invalid site configuration is not a local request. */ }
  }
  throw new HttpError(503, "The service cannot accept this request right now.");
}

/** Durable across serverless instances. No raw IP/email is stored. Fail closed. */
export async function enforceRateLimit(scope: string, subject: string, limit: number, seconds: number) {
  const secret = process.env.RATE_LIMIT_SECRET;
  if (!secret || secret.length < 32) throw new HttpError(503, "Secure server setup is incomplete. Please contact the administrator.");
  const digest = createHmac("sha256", secret).update(`${scope}:${subject}`).digest("hex");
  const { data, error } = await serviceClient().rpc("consume_rate_limit", { p_key: `${scope}:${digest}`, p_limit: limit, p_seconds: seconds });
  if (error) throw new HttpError(503, "The service is temporarily unavailable. Please try again later.");
  if (!data) throw new HttpError(429, "Too many attempts. Please wait a few minutes and try again.");
}

export function routeError(error: unknown): Response {
  const known = error instanceof HttpError;
  return Response.json({ error: known ? error.message : "The request could not be completed. Please try again." }, {
    status: known ? error.status : 500,
    headers: { "Cache-Control": "private, no-store", ...(known && error.status === 429 ? { "Retry-After": "60" } : {}) },
  });
}