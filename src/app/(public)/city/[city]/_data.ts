import { cache } from "react";
import { isConfigured } from "@/lib/config";
import { anonymousClient } from "@/lib/db/clients";
import { DataUnavailableError } from "@/lib/data/errors";
import { getCityFacets, getPublicCity, searchVenues } from "@/lib/data/public";
import type { SearchParams } from "@/lib/types";
import { hasActiveFilters, parseSearchParams } from "@/lib/validation";

// Primitive cache arguments let the page and its metadata share the same request-scoped live reads.
export const loadCityPage = cache(async (slug: string, query: string) => {
  const city = await getPublicCity(slug);
  if (!city) return null;
  const params = new URLSearchParams(query);
  const raw: SearchParams = Object.fromEntries(params.entries());
  raw.facility = params.getAll("facility");
  const filters = parseSearchParams(raw);
  const [result, facets, cover] = await Promise.all([
    searchVenues(filters, city.id), getCityFacets(city.id),
    // Resolve the active public city first. Anonymous RLS independently checks
    // media eligibility; this must never use an admin/session inventory client.
    isConfigured() ? anonymousClient().from("media_assets").select("*").eq("city_id", city.id)
      .order("is_cover", { ascending: false }).order("sort_order").order("id").limit(1).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (cover.error) throw new DataUnavailableError();
  let hasInventory = result.total > 0;
  if (!hasInventory && hasActiveFilters(filters)) {
    const unfiltered = await searchVenues(parseSearchParams({}), city.id);
    hasInventory = unfiltered.total > 0;
  }
  return { city, filters, result, facets, hasInventory, cover: cover.data };
});