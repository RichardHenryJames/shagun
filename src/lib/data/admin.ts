import "server-only";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { DataUnavailableError } from "@/lib/data/errors";
import { FACILITY_CODES, PAGE_SIZE, PRICE_TYPES, VENUE_TYPES, VERIFICATION_STATUSES, type AdminVenue, type City, type CitySummary, type DashboardData, type Facets, type Photo, type PublicVenue, type SearchFilters, type SearchParams, type SearchResult, type VenueResearch } from "@/lib/types";
import { citySchema, filterParams, parseSearchParams, slugSchema, uuidSchema } from "@/lib/validation";

// Validate JSON RPC responses rather than asserting an untyped provider payload
// is a public document. Unknown fields (including research) are stripped at each
// object boundary before any data reaches shared UI or a client media island.
const previewCitySchema = citySchema.extend({
  id: uuidSchema, launched_at: z.string().nullable(), created_at: z.string(), updated_at: z.string(),
});
const previewPhotoSchema = z.object({
  id: uuidSchema, venue_id: uuidSchema.nullable(), city_id: uuidSchema.nullable(), storage_key: uuidSchema,
  alt_text: z.string(), credit: z.string().nullable(), width: z.number().int().positive(), height: z.number().int().positive(),
  sort_order: z.number().int().nonnegative(), is_cover: z.boolean(), created_at: z.string(),
});
const previewVenueSchema = z.object({
  id: uuidSchema, city_id: uuidSchema, name: z.string(), slug: slugSchema, description: z.string().nullable(),
  venue_type: z.enum(VENUE_TYPES), address: z.string().nullable(), locality: z.string().nullable(),
  phone: z.string().nullable(), alternate_phone: z.string().nullable(), whatsapp: z.string().nullable(), email: z.string().nullable(),
  capacity_min: z.number().nullable(), capacity_max: z.number().nullable(), price_min: z.number().nullable(), price_max: z.number().nullable(),
  price_type: z.enum(PRICE_TYPES).nullable(), latitude: z.number().nullable(), longitude: z.number().nullable(),
  status: z.enum(["draft", "published"]), verification_status: z.enum(VERIFICATION_STATUSES), verified_at: z.string().nullable(),
  published_at: z.string().nullable(), seo_title: z.string().nullable(), seo_description: z.string().nullable(),
  created_at: z.string(), updated_at: z.string(), city: previewCitySchema,
  photos: z.array(previewPhotoSchema).max(24), facilities: z.array(z.enum(FACILITY_CODES)).max(FACILITY_CODES.length),
});
const previewResultSchema = z.object({
  items: z.array(previewVenueSchema).max(PAGE_SIZE), total: z.number().int().nonnegative(),
  page: z.number().int().min(1).max(1000), pageSize: z.literal(PAGE_SIZE),
}).refine((result) => result.total >= result.items.length && new Set(result.items.map((venue) => venue.id)).size === result.items.length);
const previewFacetsSchema = z.object({
  facilities: z.array(z.enum(FACILITY_CODES)).max(FACILITY_CODES.length), venueTypes: z.array(z.enum(VENUE_TYPES)).max(VENUE_TYPES.length),
  hasCapacity: z.boolean(), priceTypes: z.array(z.enum(PRICE_TYPES)).max(PRICE_TYPES.length),
});

export async function getDashboard(): Promise<DashboardData> {
  const { client } = await requireAdmin();
  const { data, error } = await client.rpc("admin_dashboard", {});
  if (error || !data) throw new DataUnavailableError();
  return data as unknown as DashboardData;
}
export async function getAdminCities(query = "", page = 1): Promise<{ items: CitySummary[]; total: number }> {
  const { client } = await requireAdmin();
  const { data, error } = await client.rpc("admin_city_summaries", { p_query: query.slice(0, 100), p_page: Math.max(1, Math.min(1000, page)), p_limit: 25 });
  if (error || !data) throw new DataUnavailableError();
  return data as unknown as { items: CitySummary[]; total: number };
}
export async function getAdminCity(slug: string): Promise<CitySummary | null> {
  const { client } = await requireAdmin();
  const { data: city, error } = await client.from("cities").select("*").eq("slug", slug).maybeSingle();
  if (error) throw new DataUnavailableError();
  if (!city) return null;
  const counts = await Promise.all([
    client.from("venues").select("id", { count: "exact", head: true }).eq("city_id", city.id),
    client.from("venues").select("id", { count: "exact", head: true }).eq("city_id", city.id).eq("status", "published"),
    client.from("venues").select("id", { count: "exact", head: true }).eq("city_id", city.id).eq("status", "draft"),
    client.rpc("admin_venues", { p_city: city.id, p_status: "needs_review", p_page: 1 }),
    client.from("media_assets").select("*").eq("city_id", city.id).order("is_cover", { ascending: false }).limit(1),
  ]);
  if (counts.some((r) => r.error)) throw new DataUnavailableError();
  const review = counts[3].data as unknown as { total: number };
  return { ...city, total_count: counts[0].count ?? 0, published_count: counts[1].count ?? 0, draft_count: counts[2].count ?? 0, review_count: review.total, cover: counts[4].data?.[0] ?? null };
}

/** Live saved-city preview. No anonymous/public RPC, service role, persistent
 * cache, fixtures or in-memory filtering of a truncated admin inventory page. */
export async function getAdminCityPreview(slug: string, requestedFilters: SearchFilters): Promise<{
  city: City; cover: Photo | null; filters: SearchFilters; result: SearchResult; facets: Facets; hasInventory: boolean;
} | null> {
  const { client } = await requireAdmin();
  if (!slugSchema.safeParse(slug).success) return null;
  const record = await client.from("cities").select("*").eq("slug", slug).maybeSingle();
  if (record.error) throw new DataUnavailableError();
  if (!record.data) return null;
  const parsedCity = previewCitySchema.safeParse(record.data);
  if (!parsedCity.success) throw new DataUnavailableError();
  const city = parsedCity.data;
  const parameters = filterParams(requestedFilters);
  const raw: SearchParams = Object.fromEntries(parameters);
  raw.facility = parameters.getAll("facility");
  const filters = parseSearchParams(raw);

  // Parent-owned SQL/type additions: both RPCs must require the active admin
  // UUID and use city_id + status IN ('draft', 'published'), without requiring
  // an active city. Search args mirror search_venues with a required p_city;
  // facets aggregate the entire eligible city, independently of pagination.
  const [search, facetResponse, inventory, coverResponse] = await Promise.all([
    client.rpc("preview_city_venues", {
      p_city: city.id, p_query: filters.q, p_capacity: filters.capacity, p_budget: filters.budget,
      p_price_type: filters.priceType, p_facilities: filters.facilities, p_type: filters.type,
      p_sort: filters.sort, p_page: filters.page, p_limit: PAGE_SIZE,
    }),
    client.rpc("preview_city_facets", { p_city: city.id }),
    client.from("venues").select("id", { count: "exact", head: true }).eq("city_id", city.id).in("status", ["draft", "published"]),
    client.from("media_assets").select("*").eq("city_id", city.id)
      .order("is_cover", { ascending: false }).order("sort_order").order("id").limit(1).maybeSingle(),
  ]);
  if (search.error || facetResponse.error || inventory.error || typeof inventory.count !== "number"
    || !Number.isSafeInteger(inventory.count) || inventory.count < 0 || coverResponse.error) throw new DataUnavailableError();
  const result = previewResultSchema.safeParse(search.data);
  const facets = previewFacetsSchema.safeParse(facetResponse.data);
  const cover = previewPhotoSchema.nullable().safeParse(coverResponse.data);
  if (!result.success || !facets.success || !cover.success) throw new DataUnavailableError();
  if (result.data.page !== filters.page || result.data.items.some((venue) => venue.city_id !== city.id || venue.city.id !== city.id || venue.city.slug !== city.slug
    || venue.photos.some((photo) => photo.venue_id !== venue.id || photo.city_id !== null))) throw new DataUnavailableError();
  if (cover.data && (cover.data.city_id !== city.id || cover.data.venue_id !== null)) throw new DataUnavailableError();
  return { city, cover: cover.data, filters, result: result.data, facets: facets.data, hasInventory: inventory.count > 0 || result.data.total > 0 };
}

export async function getAdminVenues(options: { cityId?: string; q?: string; status?: string; page?: number } = {}): Promise<{ items: PublicVenue[]; total: number; page: number; pageSize: number }> {
  const { client } = await requireAdmin();
  const { data, error } = await client.rpc("admin_venues", { p_city: options.cityId ?? null, p_query: (options.q ?? "").slice(0, 100), p_status: options.status ?? "", p_page: Math.max(1, Math.min(1000, options.page ?? 1)) });
  if (error || !data) throw new DataUnavailableError();
  return data as unknown as { items: PublicVenue[]; total: number; page: number; pageSize: number };
}
export async function getAdminVenue(id: string): Promise<AdminVenue | null> {
  const { client } = await requireAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [document, research] = await Promise.all([
    client.rpc("venue_document", { p_id: id }),
    client.from("venue_research").select("*").eq("venue_id", id).maybeSingle(),
  ]);
  if (document.error || research.error) throw new DataUnavailableError();
  if (!document.data) return null;
  return { ...document.data as unknown as PublicVenue, research: research.data as VenueResearch | null };
}
export async function getAdminPhotos(owner: { cityId?: string; venueId?: string }): Promise<Photo[]> {
  const { client } = await requireAdmin();
  if (Boolean(owner.cityId) === Boolean(owner.venueId)) return [];
  const { data, error } = await client.from("media_assets").select("*").eq(owner.cityId ? "city_id" : "venue_id", owner.cityId ?? owner.venueId!).order("sort_order").order("id");
  if (error) throw new DataUnavailableError();
  return data ?? [];
}