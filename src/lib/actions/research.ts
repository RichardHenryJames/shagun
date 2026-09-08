"use server";

import "server-only";
import { z } from "zod";
import catalogData from "../../../data/research/hazaribag-2026-09-08.json";
import { actionError, freshAdminContext, textFields } from "@/lib/actions/shared";
import { invalidateInventory } from "@/lib/cache";
import {
  createResearchRegistry, researchCatalogForCity, researchCatalogSummary, researchMatchesCity, researchVenueInput,
  type ResearchCityPick, type ResearchSummary,
} from "@/lib/research-catalog";
import { enforceRateLimit } from "@/lib/security";
import type { ActionState, City } from "@/lib/types";
import { uuidSchema } from "@/lib/validation";

export type { ResearchSummary } from "@/lib/research-catalog";

// Registration is explicit and server-only. Keys and matching come from catalog
// identity, not city-name conditionals, database seeds or public/preview routes.
const registry = createResearchRegistry([catalogData]);
const importRequestSchema = z.object({
  city_id: uuidSchema,
  catalog_key: z.string().min(1).max(2048).refine((key) => registry.has(key), "This research batch is unavailable. Reload the city workspace."),
}).strict();

function validateFormData(formData: FormData) {
  return importRequestSchema.parse(textFields(formData, ["city_id", "catalog_key"]));
}

async function savedResearchCity(client: Awaited<ReturnType<typeof freshAdminContext>>["client"], cityId: string) {
  const { data, error } = await client.from("cities").select("id,name,slug,state,country").eq("id", cityId).single();
  if (error) throw error;
  if (!data || data.id !== cityId) throw new Error("The saved city could not be confirmed.");
  return data;
}

/** Even this read-only Server Action reauthorizes; no notes or catalog rows leave it. */
export async function researchSummaryForCity(cityPick: ResearchCityPick & Pick<City, "id">): Promise<ResearchSummary | null> {
  try {
    const { client } = await freshAdminContext();
    const city = await savedResearchCity(client, uuidSchema.parse(cityPick.id));
    if (!researchMatchesCity(cityPick, city)) return null;
    const catalog = researchCatalogForCity(registry, city);
    return catalog ? researchCatalogSummary(catalog, city.name) : null;
  } catch {
    // Hide the optional card on lost authorization or unavailable city data.
    return null;
  }
}

export async function importResearchAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  let created = 0;
  let skipped = 0;
  let unconfirmedWrite = false;
  let started = false;
  let failure: ActionState | null = null;
  try {
    const { client, admin } = await freshAdminContext();
    const fields = validateFormData(formData);
    const catalog = registry.get(fields.catalog_key);
    if (!catalog) throw new Error("The research batch is unavailable.");
    const city = await savedResearchCity(client, fields.city_id);
    if (!researchMatchesCity(catalog.city, city)) {
      return { error: "This research batch does not match the saved city. Reload the city workspace.", fieldErrors: {
        city_id: ["The saved city's slug, state and country must match the research batch."],
      } };
    }

    // The registry rejects batches over 12. Validate every whitelisted payload
    // before any import write; readiness flags never count as editorial review.
    const inputs = catalog.venues.map((venue) => researchVenueInput(catalog, venue, city.id));
    await enforceRateLimit("admin-research-import", admin.id, 3, 60);
    started = true;
    for (const input of inputs) {
      const { data: existing, error: lookupError } = await client.from("venues")
        .select("id").eq("city_id", city.id).eq("slug", input.slug).maybeSingle();
      if (lookupError) throw lookupError;
      // Every existing status is skipped, including edited/archived records.
      if (existing) { skipped++; continue; }

      try {
        // One atomic RPC owns facts, facilities and private research. Inserts
        // only: no update/upsert/retry path, and no review/publication/activation.
        unconfirmedWrite = true;
        const { data, error } = await client.rpc("save_venue", { p_id: null, p_expected: null, p_data: input });
        if (error) { unconfirmedWrite = false; throw error; }
        if (!uuidSchema.safeParse(data).success) throw new Error("The new draft could not be confirmed.");
        created++;
        unconfirmedWrite = false;
      } catch (error) {
        // Only an insert's SQL uniqueness code can be a concurrent-create skip.
        if (error !== null && typeof error === "object" && "code" in error && error.code === "23505") {
          unconfirmedWrite = false;
          skipped++;
          continue;
        }
        throw error;
      }
    }
  } catch (error) {
    failure = actionError(error, "save_venue");
  }

  // An interrupted response or missing returned UUID may still have committed.
  // Refresh possible progress, but never count an unconfirmed save as created.
  if (created > 0 || unconfirmedWrite) {
    try { invalidateInventory(); }
    catch { failure ??= { error: "The saved drafts could not be reflected in this workspace. Reload the page." }; }
  }
  const progress = `Created ${created} draft${created === 1 ? "" : "s"}; skipped ${skipped} existing venue${skipped === 1 ? "" : "s"}.`;
  if (failure) return started ? {
    ...failure, error: `${progress} The import could not be fully confirmed. ${failure.error ?? "The import stopped."} Check saved inventory before retrying. Existing venues are never overwritten.`,
  } : failure;
  return { success: true, message: `${progress} Existing venues were left unchanged. Preview and review each draft before publishing; the city lifecycle is unchanged.` };
}