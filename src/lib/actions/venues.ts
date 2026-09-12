"use server";

import "server-only";
import { z } from "zod";
import { redirect } from "next/navigation";
import { BULK_PUBLISH_LIMIT, type BulkPublishResult, type BulkPublishRow } from "@/lib/bulk-publish";
import { invalidateInventory } from "@/lib/cache";
import { slugify } from "@/lib/format";
import { enforceRateLimit } from "@/lib/security";
import type { ActionState } from "@/lib/types";
import { uuidSchema, venueSchema } from "@/lib/validation";
import { actionError, deleteRecordSchema, freshAdminContext, saveVersionSchema, sqlTimestampSchema, textFields } from "@/lib/actions/shared";

const checkDateSchema = z.union([z.iso.date(), sqlTimestampSchema]);
const venueInputSchema = venueSchema.superRefine((venue, context) => {
  // These additional SQL invariants also apply to a reviewed, unpublished draft.
  if (venue.reviewed && !venue.source_notes) {
    context.addIssue({ code: "custom", path: ["source_notes"], message: "Add source notes before confirming editorial review." });
  }
  if (venue.verified_at && !checkDateSchema.safeParse(venue.verified_at).success) {
    context.addIssue({ code: "custom", path: ["verified_at"], message: "Use a valid ISO check date from the date picker." });
  }
});

const bulkPublishSchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("review"), targets: z.array(z.strictObject({ id: uuidSchema, expected_updated_at: sqlTimestampSchema })).min(1).max(BULK_PUBLISH_LIMIT) }),
  z.strictObject({ mode: z.literal("publish"), reviewed: z.literal(true), targets: z.array(z.strictObject({ id: uuidSchema, expected_updated_at: sqlTimestampSchema })).min(1).max(BULK_PUBLISH_LIMIT) }),
]).refine((input) => new Set(input.targets.map((target) => target.id)).size === input.targets.length, "Select each venue once.");
const savedPublishSchema = z.object({
  id: uuidSchema, updated_at: sqlTimestampSchema, status: z.enum(["draft", "unpublished", "published", "archived"]),
  name: z.string().min(2).max(180), city_id: uuidSchema,
  city: z.object({ id: uuidSchema, name: z.string().min(2).max(100), status: z.enum(["draft", "active", "inactive", "archived"]) }),
}).passthrough();

export async function bulkPublishVenuesAction(input: unknown): Promise<BulkPublishResult> {
  const rows: BulkPublishRow[] = [];
  let phase: BulkPublishResult["phase"] = "review";
  let possiblyChanged = false;
  try {
    const { client, admin } = await freshAdminContext();
    const parsed = bulkPublishSchema.safeParse(input);
    if (!parsed.success) return { phase, rows, error: "Select up to 25 saved venues and explicitly confirm editorial review before publishing." };
    const request = parsed.data;
    phase = request.mode === "review" ? "review" : "complete";
    await enforceRateLimit("admin-bulk-publish", admin.id, 30, 60);
    const deadline = Date.now() + 35_000;
    rows.push(...request.targets.map((target): BulkPublishRow => ({ ...target, name: "Venue", outcome: "not_attempted" })));
    for (const row of rows) {
      if (Date.now() >= deadline) throw new Error("bulk_deadline");
      const [document, research] = await Promise.all([
        client.rpc("venue_document", { p_id: row.id }).abortSignal(AbortSignal.timeout(5000)),
        client.from("venue_research").select("source_notes").eq("venue_id", row.id).abortSignal(AbortSignal.timeout(5000)).maybeSingle(),
      ]);
      if (document.error || research.error) throw new Error("bulk_read_failed");
      row.outcome = "blocked";
      if (!document.data) { row.message = "This venue is no longer available."; continue; }
      const saved = savedPublishSchema.parse(document.data);
      if (saved.id !== row.id || saved.city.id !== saved.city_id) throw new Error("bulk_identity_mismatch");
      row.name = saved.name;
      row.cityName = saved.city.name;
      row.cityActive = saved.city.status === "active";
      if (saved.updated_at !== row.expected_updated_at) {
        row.outcome = "conflict"; row.message = "This venue changed. Reload and review its latest saved version."; continue;
      }
      if (saved.status === "published" || saved.status === "archived") {
        row.outcome = "skipped"; row.message = saved.status === "published" ? "Already published; unchanged." : "Archived venues must be restored in their editor first."; continue;
      }
      const details = venueInputSchema.safeParse({ ...saved, source_notes: research.data?.source_notes ?? "", status: "published", reviewed: true });
      if (!details.success) {
        row.message = !saved.address || !research.data?.source_notes?.trim()
          ? "Add a full address and private source notes in the venue editor."
          : "Some saved details do not meet publication requirements. Open the venue editor.";
        continue;
      }
      row.outcome = "ready";
      row.details = details.data;
    }
    if (request.mode === "review") return { phase, rows };
    for (const row of rows) {
      if (row.outcome !== "ready" || !row.details) continue;
      if (Date.now() >= deadline) throw new Error("bulk_deadline");
      possiblyChanged = true;
      row.outcome = "unconfirmed";
      const { data, error } = await client.rpc("save_venue", {
        p_id: row.id, p_expected: row.expected_updated_at, p_data: row.details,
      }).abortSignal(AbortSignal.timeout(8000));
      if (error) {
        if (/^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(error.code)) {
          row.outcome = error.code === "P0001" && error.message === "conflict" ? "conflict" : "blocked";
          row.message = actionError(error, "save_venue").error;
          if (error.code === "42501" || /^PGRST30[123]$/.test(error.code)) throw new Error("bulk_authorization_changed");
          continue;
        }
        throw new Error("bulk_unconfirmed");
      }
      if (data !== row.id) throw new Error("bulk_unconfirmed");
      row.outcome = "published";
      row.message = row.cityActive ? "Published." : "Published; hidden publicly until the city is active.";
    }
    return { phase, rows };
  } catch {
    rows.forEach((row) => { if (row.outcome === "ready") row.outcome = "not_attempted"; });
    return { phase, rows, error: possiblyChanged
      ? "The operation stopped. Check saved inventory and your administrator session before reviewing again. Unconfirmed saves may have completed."
      : "The selected venues could not all be checked. No venues were published. Check your administrator session and reload before reviewing again." };
  } finally {
    if (possiblyChanged) invalidateInventory();
  }
}

export async function saveVenueAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  let venueId: string;
  try {
    const { client } = await freshAdminContext();
    const fields = textFields(formData, [...Object.keys(venueSchema.shape).filter((name) => name !== "facilities"), "id", "expected_updated_at"]);
    const version = saveVersionSchema.parse(fields);
    const venue = venueInputSchema.parse({
      ...fields, slug: fields.slug.trim() ? fields.slug : slugify(fields.name), facilities: formData.getAll("facilities"),
    });
    // Research, reviewer identity/time and facilities are handled atomically by
    // this RPC. Never follow it with separate research or association writes.
    const { data, error } = await client.rpc("save_venue", {
      p_data: venue, p_id: version.id, p_expected: version.expected_updated_at,
    });
    if (error) throw error;
    venueId = uuidSchema.parse(data);
  } catch (error) {
    return actionError(error, "save_venue");
  }

  invalidateInventory();
  redirect(`/admin/venues/${encodeURIComponent(venueId)}?saved=1`);
}

export async function deleteVenueAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { client } = await freshAdminContext();
    const fields = deleteRecordSchema.parse(textFields(formData, ["id", "expected_updated_at", "confirm_name"]));
    const { error } = await client.rpc("delete_record", {
      p_kind: "venue", p_id: fields.id, p_name: fields.confirm_name, p_expected: fields.expected_updated_at,
    });
    if (error) throw error;
  } catch (error) {
    return actionError(error, "delete_venue");
  }

  invalidateInventory();
  redirect("/admin/venues");
}