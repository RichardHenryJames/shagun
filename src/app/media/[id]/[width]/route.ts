import { fixtureMode, isConfigured } from "@/lib/config";
import { anonymousClient, serviceClient } from "@/lib/db/clients";
import { imageResponse, MEDIA_BUCKET, mediaWidth } from "@/lib/media";
import { HttpError, routeError } from "@/lib/security";
import { uuidSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string; width: string }> }) {
  try {
    const { id, width: input } = await context.params;
    if (!uuidSchema.safeParse(id).success) throw new HttpError(404, "Image not found.");
    const width = mediaWidth(input);
    if (fixtureMode()) {
      const bytes = await (await import("@/lib/testing/fixture-media")).renderFixtureImage(id, width);
      if (!bytes) throw new HttpError(404, "Image not found.");
      return imageResponse(bytes);
    }
    if (!isConfigured()) throw new HttpError(404, "Image not found.");
    // Anonymous RLS is the access gate, even when the visitor has admin cookies.
    // Never hand out signed URLs or use privileged metadata reads to check access.
    const { data: photo, error } = await anonymousClient().from("media_assets").select("storage_key").eq("id", id).maybeSingle();
    if (error) throw new HttpError(503, "Images are temporarily unavailable.");
    if (!photo) throw new HttpError(404, "Image not found.");
    const { data, error: downloadError } = await serviceClient().storage.from(MEDIA_BUCKET).download(`${photo.storage_key}/${width}.webp`);
    if (downloadError || !data) throw new HttpError(404, "Image not found.");
    return imageResponse(data, "public, max-age=60, s-maxage=60");
  } catch (error) { return routeError(error); }
}