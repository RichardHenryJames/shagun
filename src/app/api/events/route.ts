import { z } from "zod";
import { fixtureMode, isConfigured } from "@/lib/config";
import { serviceClient } from "@/lib/db/clients";
import { assertSameOrigin, enforceRateLimit, HttpError, readBoundedJson, requestFingerprint, routeError } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const eventSchema = z.object({
  event: z.enum(["city_viewed", "venue_viewed", "search_performed", "filter_used", "phone_clicked", "whatsapp_clicked"]),
  cityId: z.uuid(), venueId: z.uuid().optional(),
}).strict().refine((input) => !["venue_viewed", "phone_clicked", "whatsapp_clicked"].includes(input.event) || Boolean(input.venueId));

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (process.env.NEXT_PUBLIC_ANALYTICS_ENABLED !== "true" || request.headers.get("dnt") === "1" || request.headers.get("sec-gpc") === "1" || !isConfigured() || fixtureMode()) {
      return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
    }
    const parsed = eventSchema.safeParse(await readBoundedJson(request, 512));
    if (!parsed.success) throw new HttpError(400, "Invalid event.");
    await enforceRateLimit("public-events", await requestFingerprint(), 60, 60);
    const { event, cityId, venueId } = parsed.data;
    const { error } = await serviceClient().rpc("record_event", { p_event: event, p_city: cityId, p_venue: venueId ?? null });
    if (error) throw new HttpError(503, "Events are temporarily unavailable.");
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return routeError(error); }
}