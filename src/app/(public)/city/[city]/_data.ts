import { cache } from "react";
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
  const [result, facets] = await Promise.all([searchVenues(filters, city.id), getCityFacets(city.id)]);
  let hasInventory = result.total > 0;
  if (!hasInventory && hasActiveFilters(filters)) {
    const unfiltered = await searchVenues(parseSearchParams({}), city.id);
    hasInventory = unfiltered.total > 0;
  }
  return { city, filters, result, facets, hasInventory };
});