import { z } from "zod";
import { invalidateInventory } from "@/lib/cache";
import { imageResponse, MEDIA_BUCKET, mediaAdmin, mediaFailure, mediaWidth } from "@/lib/media";
import { assertSameOrigin, enforceRateLimit, HttpError, readBoundedJson, routeError } from "@/lib/security";
import { photoMetadataSchema, uuidSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

async function photoId(context: Context) {
  const { id } = await context.params;
  if (!uuidSchema.safeParse(id).success) throw new HttpError(404, "This photo is not available.");
  return id;
}

export async function GET(request: Request, context: Context) {
  try {
    const { client } = await mediaAdmin();
    const id = await photoId(context);
    const width = mediaWidth(new URL(request.url).searchParams.get("w") ?? "960");
    const { data: photo, error } = await client.from("media_assets").select("storage_key").eq("id", id).maybeSingle();
    if (error) throw mediaFailure(error);
    if (!photo) throw new HttpError(404, "This photo is not available.");
    const { data, error: downloadError } = await client.storage.from(MEDIA_BUCKET).download(`${photo.storage_key}/${width}.webp`);
    if (downloadError || !data) throw new HttpError(404, "The image file is not available. Try uploading it again.");
    return imageResponse(data);
  } catch (error) { return routeError(error); }
}

const operationSchema = z.discriminatedUnion("operation", [
  photoMetadataSchema.extend({ operation: z.literal("metadata") }).strict(),
  z.object({ operation: z.enum(["cover", "up", "down"]) }).strict(),
]);

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const { client, admin } = await mediaAdmin();
    const id = await photoId(context);
    await enforceRateLimit("admin-photo-edit", admin.id, 120, 60);
    const parsed = operationSchema.safeParse(await readBoundedJson(request));
    if (!parsed.success) throw new HttpError(400, "Choose a photo operation and provide valid alternative text and rights credit when editing details.");
    const operation = parsed.data;
    const { error } = await client.rpc("update_photo", {
      p_id: id, p_operation: operation.operation,
      ...(operation.operation === "metadata" ? { p_alt: operation.alt_text, p_credit: operation.credit } : {}),
    });
    if (error) throw mediaFailure(error);
    invalidateInventory();
    return Response.json({ success: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return routeError(error); }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const { client, admin } = await mediaAdmin();
    const id = await photoId(context);
    await enforceRateLimit("admin-photo-edit", admin.id, 120, 60);
    const { data, error } = await client.from("media_assets").delete().eq("id", id).select("id").maybeSingle();
    if (error) throw mediaFailure(error);
    if (!data) throw new HttpError(404, "This photo has already been removed or is not available.");
    // The deletion trigger queues all three objects. Never drop a job on failure.
    invalidateInventory();
    return Response.json({ success: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return routeError(error); }
}