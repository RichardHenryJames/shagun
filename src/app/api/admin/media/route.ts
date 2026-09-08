import { randomUUID } from "node:crypto";
import { z } from "zod";
import { invalidateInventory } from "@/lib/cache";
import { MEDIA_BUCKET, MAX_UPLOAD_BODY, mediaAdmin, mediaFailure, prepareImage } from "@/lib/media";
import { assertSameOrigin, enforceRateLimit, HttpError, readBoundedFormData, routeError } from "@/lib/security";
import { photoMetadataSchema, uuidSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ownerSchema = photoMetadataSchema.extend({ venue_id: z.uuid().nullable(), city_id: z.uuid().nullable() })
  .refine((value) => Boolean(value.venue_id) !== Boolean(value.city_id));

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { client, admin } = await mediaAdmin();
    await enforceRateLimit("admin-upload", admin.id, 30, 60);
    const form = await readBoundedFormData(request, MAX_UPLOAD_BODY);
    const allowed = new Set(["file", "venue_id", "city_id", "alt_text", "credit"]);
    if ([...form.keys()].some((key) => !allowed.has(key) || form.getAll(key).length !== 1)) throw new HttpError(400, "Upload one image with one set of details.");
    const file = form.get("file");
    if (!(file instanceof File) || !/\.(jpe?g|png|webp)$/i.test(file.name)) throw new HttpError(415, "Choose a JPEG, PNG or WebP file.");
    const parsed = ownerSchema.safeParse({
      venue_id: form.get("venue_id") || null, city_id: form.get("city_id") || null,
      alt_text: form.get("alt_text"), credit: form.get("credit"),
    });
    if (!parsed.success) throw new HttpError(400, "Select one saved city or venue, and provide meaningful alternative text and a rights credit.");
    const input = parsed.data;
    const ownerColumn = input.venue_id ? "venue_id" : "city_id";
    const ownerId = input.venue_id ?? input.city_id!;
    const [owner, photos] = await Promise.all([
      client.from(input.venue_id ? "venues" : "cities").select("id").eq("id", ownerId).maybeSingle(),
      client.from("media_assets").select("id", { count: "exact", head: true }).eq(ownerColumn, ownerId),
    ]);
    if (owner.error || photos.error) throw new HttpError(503, "The saved record could not be checked. Please try again.");
    if (!owner.data) throw new HttpError(404, "Save the city or venue before adding photos.");
    if ((photos.count ?? 0) >= (input.venue_id ? 24 : 1)) throw mediaFailure({ message: "photo_limit" });

    const image = await prepareImage(new Uint8Array(await file.arrayBuffer()), file.type);
    const key = randomUUID();
    // Reserve durable cleanup BEFORE touching Storage. A killed serverless request
    // still leaves a retryable job. Finalization consumes it atomically with the row.
    const { error: reservationError } = await client.rpc("begin_media_upload", { p_key: key });
    if (reservationError) throw mediaFailure(reservationError);
    for (const variant of image.variants) {
      const { error } = await client.storage.from(MEDIA_BUCKET).upload(`${key}/${variant.width}.webp`, variant.bytes, {
        contentType: "image/webp", cacheControl: "60", upsert: false,
      });
      if (error) throw new HttpError(503, "The upload was interrupted. Incomplete files are queued for cleanup; try uploading again.");
    }
    const { data, error } = await client.rpc("finalize_media_upload", {
      p_data: { ...input, storage_key: key, width: image.width, height: image.height },
    });
    if (error) throw mediaFailure(error);
    if (!data || typeof data !== "object" || Array.isArray(data) || !uuidSchema.safeParse(data.id).success) {
      throw new HttpError(503, "The saved photo could not be confirmed. Reload the gallery before retrying.");
    }
    invalidateInventory();
    return Response.json({ photo: data }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return routeError(error); }
}