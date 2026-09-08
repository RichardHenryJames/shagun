"use server";

import "server-only";
import { z } from "zod";
import { redirect } from "next/navigation";
import { invalidateInventory } from "@/lib/cache";
import { slugify } from "@/lib/format";
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