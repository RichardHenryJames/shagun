import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { anonymousClient } from "@/lib/db/clients";
import { fixtureMode, isConfigured } from "@/lib/config";
import { DataUnavailableError } from "@/lib/data/errors";
import { PAGE_SIZE, type City, type CitySummary, type Facets, type PublicVenue, type SearchFilters, type SearchResult } from "@/lib/types";
import { parseSearchParams } from "@/lib/validation";

export async function getPublicCities(query = "", page = 1): Promise<{ items: CitySummary[]; total: number }> {
  if (fixtureMode()) return (await import("@/lib/testing/fixtures")).fixtureCities(query, page);
  if (!isConfigured()) return { items: [], total: 0 };
  const { data, error } = await anonymousClient().rpc("public_cities", { p_query: query.slice(0, 100), p_page: Math.max(1, Math.min(1000, page)), p_limit: 24 });
  if (error || !data) throw new DataUnavailableError();
  return data as unknown as { items: CitySummary[]; total: number };
}
export const getPublicCity = cache(async (slug: string): Promise<City | null> => {
  if (fixtureMode()) return (await import("@/lib/testing/fixtures")).fixtureCity(slug);
  if (!isConfigured()) return null;
  const { data, error } = await anonymousClient().from("cities").select("*").eq("slug", slug).eq("status", "active").maybeSingle();
  if (error) throw new DataUnavailableError();
  return data;
});
export async function searchVenues(filters: SearchFilters, cityId?: string): Promise<SearchResult> {
  if (fixtureMode()) return (await import("@/lib/testing/fixtures")).fixtureSearch(filters, cityId);
  if (!isConfigured()) return { items: [], total: 0, page: filters.page, pageSize: PAGE_SIZE };
  const { data, error } = await anonymousClient().rpc("search_venues", {
    p_city: cityId ?? null, p_query: filters.q, p_capacity: filters.capacity, p_budget: filters.budget,
    p_price_type: filters.priceType, p_facilities: filters.facilities, p_type: filters.type,
    p_sort: filters.sort, p_page: filters.page, p_limit: PAGE_SIZE,
  });
  if (error || !data) throw new DataUnavailableError();
  return data as unknown as SearchResult;
}
const cachedVenue = unstable_cache(async (id: string, version: string): Promise<PublicVenue | null> => {
  void version; // Part of the cache key; photos/facilities also touch the owner's version.
  const { data, error } = await anonymousClient().rpc("venue_document", { p_id: id });
  if (error) throw new DataUnavailableError();
  return data as unknown as PublicVenue | null;
}, ["public-venue-snapshot-v1"], { revalidate: 3600, tags: ["inventory"] });

export const getPublicVenue = cache(async (citySlug: string, venueSlug: string): Promise<PublicVenue | null> => {
  if (fixtureMode()) return (await import("@/lib/testing/fixtures")).fixtureVenue(citySlug, venueSlug);
  const city = await getPublicCity(citySlug);
  if (!city) return null;
  // Live RLS check BEFORE cached content. A formerly published snapshot is not an access grant.
  const { data, error } = await anonymousClient().from("venues").select("id,updated_at").eq("city_id", city.id).eq("slug", venueSlug).eq("status", "published").maybeSingle();
  if (error) throw new DataUnavailableError();
  if (!data) return null;
  const venue = await cachedVenue(data.id, data.updated_at);
  return venue ? { ...venue, city } : null;
});
export async function getCityFacets(cityId: string): Promise<Facets> {
  if (fixtureMode()) return (await import("@/lib/testing/fixtures")).fixtureFacets(cityId);
  if (!isConfigured()) return { facilities: [], venueTypes: [], hasCapacity: false, priceTypes: [] };
  const { data, error } = await anonymousClient().rpc("city_facets", { p_city: cityId });
  if (error || !data) throw new DataUnavailableError();
  return data as unknown as Facets;
}
export async function getRecentVenues(limit = 6): Promise<PublicVenue[]> {
  return (await searchVenues(parseSearchParams({}))).items.slice(0, Math.min(12, Math.max(1, limit)));
}
export async function getSitemapCount(): Promise<number> {
  if (!isConfigured()) return 0;
  const { data, error } = await anonymousClient().rpc("sitemap_entries", { p_offset: 0, p_limit: 0 });
  if (error || !data) throw new DataUnavailableError();
  return (data as unknown as { total: number }).total;
}
export async function getSitemapRoutes(offset: number, limit: number): Promise<Array<{ path: string; updatedAt: string }>> {
  if (!isConfigured()) return [];
  const { data, error } = await anonymousClient().rpc("sitemap_entries", { p_offset: offset, p_limit: limit });
  if (error || !data) throw new DataUnavailableError();
  return (data as unknown as { items: Array<{ path: string; updatedAt: string }> }).items;
}