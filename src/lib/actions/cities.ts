"use server";

import "server-only";
import { redirect } from "next/navigation";
import { invalidateInventory } from "@/lib/cache";
import { slugify } from "@/lib/format";
import type { ActionState } from "@/lib/types";
import { citySchema, uuidSchema } from "@/lib/validation";
import { actionError, deleteRecordSchema, freshAdminContext, saveVersionSchema, textFields } from "@/lib/actions/shared";

const cityInputSchema = citySchema.superRefine((city, context) => {
  if (Buffer.byteLength(JSON.stringify(city.metadata), "utf8") > 3000) {
    context.addIssue({ code: "custom", path: ["metadata"], message: "Keep metadata under 3 KB, including multi-byte characters." });
  }
});

export async function saveCityAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  let slug: string;
  try {
    const { client } = await freshAdminContext();
    const fields = textFields(formData, [...Object.keys(citySchema.shape), "id", "expected_updated_at"]);
    const version = saveVersionSchema.parse(fields);
    const city = cityInputSchema.parse({ ...fields, slug: fields.slug.trim() ? fields.slug : slugify(fields.name) });
    const { data, error } = await client.rpc("save_city", {
      p_data: city, p_id: version.id, p_expected: version.expected_updated_at,
    });
    if (error) throw error;
    if (!uuidSchema.safeParse(data).success) throw new Error("save_failed");
    slug = city.slug;
  } catch (error) {
    return actionError(error, "save_city");
  }

  invalidateInventory();
  redirect(`/admin/cities/${encodeURIComponent(slug)}/edit`);
}

export async function deleteCityAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { client } = await freshAdminContext();
    const fields = deleteRecordSchema.parse(textFields(formData, ["id", "expected_updated_at", "confirm_name"]));
    const { error } = await client.rpc("delete_record", {
      p_kind: "city", p_id: fields.id, p_name: fields.confirm_name, p_expected: fields.expected_updated_at,
    });
    if (error) throw error;
  } catch (error) {
    return actionError(error, "delete_city");
  }

  invalidateInventory();
  redirect("/admin/cities");
}