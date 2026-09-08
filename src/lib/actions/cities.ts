"use server";

import "server-only";
import { redirect } from "next/navigation";
import { z } from "zod";
import { invalidateInventory } from "@/lib/cache";
import { getCatalogCity } from "@/lib/city-catalog";
import { foldCatalogText } from "@/lib/city-catalog-data";
import { slugify } from "@/lib/format";
import type { ActionState } from "@/lib/types";
import { citySchema, uuidSchema } from "@/lib/validation";
import { actionError, deleteRecordSchema, freshAdminContext, saveVersionSchema, textFields } from "@/lib/actions/shared";

const SOURCE_KEY = "geographic_source_id";
const catalogSelectionSchema = z.object({
  catalog_id: z.union([z.literal(""), z.string().regex(/^geonames:[1-9]\d{0,14}$/, "Choose a city from the catalog results.")]),
});
const cityInputSchema = citySchema.superRefine((city, context) => {
  if (Buffer.byteLength(JSON.stringify(city.metadata), "utf8") > 3000) {
    context.addIssue({ code: "custom", path: ["metadata"], message: "Keep metadata under 3 KB, including multi-byte characters." });
  }
});

function selectionError(field: string, message: string): never {
  throw new z.ZodError([{ code: "custom", path: [field], message }]);
}

export async function saveCityAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  let slug: string;
  try {
    const { client } = await freshAdminContext();
    const fields = textFields(formData, [...Object.keys(citySchema.shape), "catalog_id", "id", "expected_updated_at"]);
    const version = saveVersionSchema.parse(fields);
    const selection = catalogSelectionSchema.parse(fields);
    // Read the saved association with the same freshly authorized session. A
    // missing hidden field in an older editor must not remove an association.
    const saved = version.id ? await client.from("cities")
      .select("id,name,state,country,metadata").eq("id", version.id).maybeSingle() : null;
    if (saved?.error) throw saved.error;
    if (saved && !saved.data) throw { code: "P0002", message: "not_found" };
    const metadata = saved?.data?.metadata;
    const savedSource = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata[SOURCE_KEY] : undefined;
    if (savedSource !== undefined && (typeof savedSource !== "string" || !catalogSelectionSchema.safeParse({ catalog_id: savedSource }).success || !savedSource)) {
      selectionError("catalog_id", "The saved geographic source needs an administrator's review before editing this city.");
    }
    if (savedSource && selection.catalog_id && selection.catalog_id !== savedSource) {
      selectionError("catalog_id", "The geographic source cannot change after it is saved. Keep this city's existing association.");
    }
    const sourceId = typeof savedSource === "string" ? savedSource : selection.catalog_id;
    // Only a selected/saved ID is an authority. Never resolve geography from
    // editable names, posted metadata, an alias guess, or a hardcoded city list.
    const source = sourceId ? getCatalogCity(sourceId) : null;
    if (sourceId && !source && !savedSource) selectionError("catalog_id", "This catalog city is no longer available. Search and select it again, or use manual entry.");

    const city = cityInputSchema.parse({
      ...fields,
      name: fields.name.trim() || source?.name || fields.name,
      state: fields.state.trim() || source?.state || fields.state,
      country: fields.country.trim() || source?.country || fields.country,
      slug: fields.slug.trim() ? fields.slug : source?.suggestedSlug ?? slugify(fields.name),
    });
    if (source) {
      if (foldCatalogText(city.state) !== foldCatalogText(source.state)) selectionError("state", "Use the selected catalog city's state or union territory.");
      if (foldCatalogText(city.country) !== foldCatalogText(source.country)) selectionError("country", "Use India for a city selected from this catalog.");
      city.state = source.state;
      city.country = source.country;
    } else if (savedSource && saved?.data && (city.name !== saved.data.name || city.state !== saved.data.state || city.country !== saved.data.country)) {
      // A refreshed catalog may retire an ID. Preserve existing geographic
      // fields and the ID on unrelated edits; do not silently detach/reassign it.
      selectionError("catalog_id", "This saved source is no longer in the catalog. Keep the saved name, state and country while its association is reviewed.");
    }
    if (Object.hasOwn(city.metadata, SOURCE_KEY) && (!sourceId || city.metadata[SOURCE_KEY] !== sourceId)) {
      selectionError("metadata", "geographic_source_id is reserved. Select a catalog city instead of editing this key in metadata.");
    }
    if (sourceId) city.metadata[SOURCE_KEY] = sourceId;
    // The server-owned scalar counts towards the same flat/UTF-8 metadata
    // budget. The atomic RPC still checks the exact original optimistic version.
    const payload = cityInputSchema.parse(city);
    const { data, error } = await client.rpc("save_city", {
      p_data: payload, p_id: version.id, p_expected: version.expected_updated_at,
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