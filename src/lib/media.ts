import "server-only";
import sharp from "sharp";
import { getAdminContext } from "@/lib/auth";
import { HttpError } from "@/lib/security";

export { MEDIA_BUCKET } from "@/lib/db/schema";
export const MEDIA_WIDTHS = [480, 960, 1600] as const;
export type MediaWidth = (typeof MEDIA_WIDTHS)[number];
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const MAX_UPLOAD_BODY = MAX_IMAGE_BYTES + 64 * 1024;
export const MAX_IMAGE_PIXELS = 40_000_000;
const MIME_FORMATS: Record<string, string> = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" };

export async function mediaAdmin() {
  const context = await getAdminContext();
  if (!context) throw new HttpError(401, "Sign in with an active administrator account to continue.");
  return context;
}

export function mediaWidth(value: string): MediaWidth {
  if (value === "480" || value === "960" || value === "1600") return Number(value) as MediaWidth;
  throw new HttpError(404, "This image size is not available.");
}

export function mediaFailure(error: { code?: string; message?: string }): HttpError {
  if (error.code === "42501") return new HttpError(403, "Your administrator access has changed. Sign in again.");
  if (error.code === "P0002") return new HttpError(404, "This photo or record is no longer available.");
  if (error.message === "photo_limit") return new HttpError(409, "The photo limit has been reached: one city cover or 24 venue photos. Remove a photo before adding another.");
  if (error.code === "23503") return new HttpError(409, "The city or venue has changed. Reload it before uploading.");
  if (error.message === "upload_expired") return new HttpError(409, "The upload expired. Select the image again; incomplete files are queued for cleanup.");
  return new HttpError(503, "The photo could not be saved. Please try again; incomplete files are queued for cleanup.");
}

/** Decode actual bytes, reject animation/bombs, rotate, and re-encode without EXIF. */
export async function prepareImage(bytes: Uint8Array, mimeType: string) {
  if (!bytes.byteLength || bytes.byteLength > MAX_IMAGE_BYTES) throw new HttpError(413, "Choose a nonempty image up to 3 MB.");
  if (!Object.hasOwn(MIME_FORMATS, mimeType)) throw new HttpError(415, "Only JPEG, PNG and WebP images are accepted.");
  try {
    const input = Buffer.from(bytes);
    const options = { limitInputPixels: MAX_IMAGE_PIXELS, failOn: "warning" as const, animated: true };
    const metadata = await sharp(input, options).metadata();
    if (metadata.format !== MIME_FORMATS[mimeType] || (metadata.pages ?? 1) !== 1) {
      throw new HttpError(415, "The image must be a non-animated JPEG, PNG or WebP matching its file type.");
    }
    if (!metadata.width || !metadata.height || metadata.width > 20000 || metadata.height > 20000 || metadata.width * metadata.height > MAX_IMAGE_PIXELS) {
      throw new HttpError(413, "This image has too many pixels. Resize it below 40 megapixels and 20,000 pixels per side.");
    }
    const variants: Array<{ width: MediaWidth; bytes: Buffer }> = [];
    let width = 0; let height = 0;
    // Sequential processing bounds peak memory. No originals or metadata are retained.
    for (const target of MEDIA_WIDTHS) {
      const output = await sharp(input, options).rotate().resize({ width: target, withoutEnlargement: true })
        .webp({ quality: 80, effort: 4 }).toBuffer({ resolveWithObject: true });
      if (output.data.byteLength > MAX_IMAGE_BYTES) throw new HttpError(413, "This image is still too large after processing. Choose a smaller image.");
      variants.push({ width: target, bytes: output.data });
      width = output.info.width; height = output.info.height;
    }
    return { variants, width, height };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(415, "This image could not be safely decoded. Choose a valid, smaller JPEG, PNG or WebP.");
  }
}

export function imageResponse(bytes: Blob | Uint8Array, cacheControl = "private, no-store") {
  return new Response(bytes instanceof Blob ? bytes : new Uint8Array(bytes), {
    headers: { "Content-Type": "image/webp", "Cache-Control": cacheControl, "X-Content-Type-Options": "nosniff" },
  });
}