import "server-only";
import { fixtureMode } from "@/lib/config";
import {
  PAGE_SIZE,
  type City,
  type CitySummary,
  type Facets,
  type FacilityCode,
  type Photo,
  type PriceType,
  type PublicVenue,
  type SearchFilters,
  type SearchResult,
  type VenueType,
} from "@/lib/types";

/** Local UI data only. Never seed, persist, or import these records into admin data. */
const CITY_ID = "10000000-0000-4000-8000-000000000001";
const EMPTY_CITY_ID = "10000000-0000-4000-8000-000000000002";
const CREATED_AT = "2025-12-01T00:00:00.000Z";
const UPDATED_AT = "2026-01-16T00:00:00.000Z";
const CITY_PAGE_SIZE = 24;

type Scenario = "empty" | "one" | "many";
type Recipe = {
  name: string;
  slug: string;
  type: VenueType;
  capacity: readonly [number | null, number | null];
  price: readonly [number | null, number | null, PriceType | null];
  facilities: readonly FacilityCode[];
};

// Explicit expectations, including upper-bound-only prices and unrecorded maximum capacity.
// Each name is visibly synthetic even when a card hides its description.
const RECIPES: readonly Recipe[] = [
  { name: "Synthetic Gallery Hall", slug: "synthetic-gallery-hall", type: "vivah_bhawan", capacity: [100, 600], price: [20000, 30000, "per_day"], facilities: ["ac", "parking", "rooms", "catering", "power_backup", "accessible_entry"] },
  { name: "Synthetic Minimal Hall", slug: "synthetic-minimal-hall", type: "community_hall", capacity: [null, null], price: [null, null, null], facilities: [] },
  { name: "Synthetic Amber Hall", slug: "synthetic-amber-hall", type: "banquet_hall", capacity: [80, 300], price: [10000, 18000, "per_day"], facilities: ["parking", "ac", "kitchen"] },
  { name: "Synthetic Birch Hall", slug: "synthetic-birch-hall", type: "vivah_bhawan", capacity: [120, 600], price: [30000, 45000, "per_day"], facilities: ["parking", "rooms", "power_backup"] },
  { name: "Synthetic Copper Lawn", slug: "synthetic-copper-lawn", type: "wedding_lawn", capacity: [200, 900], price: [40000, 55000, "per_event"], facilities: ["parking", "decoration", "power_backup"] },
  { name: "Synthetic Dune Hall", slug: "synthetic-dune-hall", type: "community_hall", capacity: [50, 200], price: [8000, 12000, "per_day"], facilities: ["kitchen", "accessible_entry"] },
  { name: "Synthetic Elm Pavilion", slug: "synthetic-elm-pavilion", type: "wedding_lawn", capacity: [150, 800], price: [1200, 1800, "per_plate"], facilities: ["parking", "catering", "decoration"] },
  { name: "Synthetic Fern Hall", slug: "synthetic-fern-hall", type: "hotel", capacity: [75, 450], price: [1800, 2600, "per_plate"], facilities: ["ac", "parking", "catering", "rooms", "lift"] },
  { name: "Synthetic Garnet Hall", slug: "synthetic-garnet-hall", type: "banquet_hall", capacity: [300, 1200], price: [60000, 90000, "per_event"], facilities: ["parking", "ac", "power_backup"] },
  { name: "Synthetic Hazel Court", slug: "synthetic-hazel-court", type: "resort", capacity: [100, 700], price: [50000, null, "per_day"], facilities: ["parking", "rooms", "decoration", "accessible_entry"] },
  { name: "Synthetic Indigo Hall", slug: "synthetic-indigo-hall", type: "vivah_bhawan", capacity: [90, 400], price: [15000, null, "per_day"], facilities: ["ac", "parking", "kitchen"] },
  { name: "Synthetic Jade Pavilion", slug: "synthetic-jade-pavilion", type: "wedding_lawn", capacity: [60, 350], price: [null, 25000, "per_event"], facilities: ["parking", "decoration"] },
  { name: "Synthetic Kite Hall", slug: "synthetic-kite-hall", type: "community_hall", capacity: [null, 150], price: [null, 9000, "per_day"], facilities: ["accessible_entry", "kitchen"] },
  { name: "Synthetic Linen Hall", slug: "synthetic-linen-hall", type: "banquet_hall", capacity: [250, null], price: [900, 1200, "per_plate"], facilities: ["ac", "catering"] },
  { name: "Synthetic Mosaic Court", slug: "synthetic-mosaic-court", type: "hotel", capacity: [110, 550], price: [35000, 50000, "per_event"], facilities: ["parking", "rooms", "lift"] },
  { name: "Synthetic Ochre Hall", slug: "synthetic-ochre-hall", type: "resort", capacity: [180, 1000], price: [2200, 3000, "per_plate"], facilities: ["parking", "catering", "rooms", "accessible_entry"] },
];

function requireFixtureMode(): void {
  // Check on EVERY exported access, not just module evaluation or a cached first request.
  // fixtureMode also rejects Vercel, non-loopback origins, and a configured database.
  if (!fixtureMode()) throw new Error("Local synthetic fixtures are disabled.");
}

function scenario(): Scenario {
  const value = process.env.SHAGUN_FIXTURE_SCENARIO ?? "many";
  if (value === "empty" || value === "one" || value === "many") return value;
  throw new Error("SHAGUN_FIXTURE_SCENARIO must be empty, one, or many.");
}

function fixtureId(group: "20000000" | "30000000", number: number): string {
  return `${group}-0000-4000-8000-${String(number).padStart(12, "0")}`;
}

function inventory(): { cities: City[]; venues: PublicVenue[] } {
  const mode = scenario();
  if (mode === "empty") return { cities: [], venues: [] };

  // Fresh objects on each access prevent a consumer from mutating future fixture requests.
  const city: City = {
    id: CITY_ID, name: "Hazaribag", slug: "hazaribag", state: "Jharkhand", country: "India",
    description: "SYNTHETIC LOCAL TEST GUIDE. Hazaribag is used only to exercise this interface. Every venue, facility and price in this guide is invented test data, not real-world venue information or a recommendation.",
    status: "active", seo_title: "Synthetic Hazaribag city guide",
    seo_description: "Local browser QA only. These synthetic Hazaribag listings are not real venues, recommendations, contact details or price quotations.",
    metadata: { synthetic: true, local_only: true }, launched_at: "2026-01-01T00:00:00.000Z",
    created_at: CREATED_AT, updated_at: UPDATED_AT,
  };
  const emptyCity: City = {
    ...city, id: EMPTY_CITY_ID, name: "Synthetic Empty City", slug: "synthetic-empty-city",
    state: "Synthetic Test Region", country: "Synthetic Test Country",
    description: "SYNTHETIC LOCAL TEST GUIDE. This invented city has no inventory and exists only to exercise the empty-guide interface. It is not a real place.",
    seo_title: "Synthetic empty city guide",
    seo_description: "An invented, empty city guide for local browser QA. Not a real place or a venue recommendation.",
    metadata: { synthetic: true, local_only: true },
  };
  const recipes = mode === "one" ? RECIPES.slice(0, 1) : RECIPES;
  const venues = recipes.map((recipe, index): PublicVenue => {
    const id = fixtureId("20000000", index + 1);
    const minimal = recipe.slug === "synthetic-minimal-hall";
    const updatedAt = new Date(Date.UTC(2026, 0, 16 - index)).toISOString();
    const photos: Photo[] = index === 0 ? Array.from({ length: 6 }, (_, photoIndex) => ({
      id: fixtureId("30000000", photoIndex + 1), venue_id: id, city_id: null,
      storage_key: fixtureId("30000000", photoIndex + 1),
      alt_text: `Synthetic test-card diagram ${photoIndex + 1} of 6. Not a venue photograph.`,
      credit: "Original synthetic test-card diagram for local QA; not a venue photograph.",
      width: 1600, height: 1000, sort_order: photoIndex, is_cover: photoIndex === 0, created_at: CREATED_AT,
    })) : [];
    return {
      id, city_id: city.id, city, name: recipe.name, slug: recipe.slug,
      description: minimal ? null : `SYNTHETIC LOCAL TEST FIXTURE: ${recipe.name}. This is not a real venue in Hazaribag. Its invented facilities, capacity and prices exist only for browser QA and are not recommendations or quotations. Any gallery images are labelled test-card diagrams, not venue photographs.`,
      venue_type: recipe.type,
      address: minimal ? null : "Synthetic test address — not a physical location. Do not visit.",
      locality: minimal ? null : "Synthetic Paper District",
      // Never create dialable numbers, mailboxes, real addresses, or map coordinates.
      phone: null, alternate_phone: null, whatsapp: null, email: null, latitude: null, longitude: null,
      capacity_min: recipe.capacity[0], capacity_max: recipe.capacity[1],
      price_min: recipe.price[0], price_max: recipe.price[1], price_type: recipe.price[2],
      status: "published", verification_status: "unverified", verified_at: null,
      published_at: updatedAt, seo_title: null, seo_description: null,
      created_at: CREATED_AT, updated_at: updatedAt, photos, facilities: [...recipe.facilities],
    };
  });
  return { cities: mode === "one" ? [city] : [city, emptyCity], venues };
}

function pageNumber(page: number): number {
  return Number.isFinite(page) ? Math.max(1, Math.min(1000, Math.trunc(page))) : 1;
}

function words(value: string): string[] {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** Approximate the SQL simple-dictionary AND-of-word-prefixes; never interpret query operators. */
function matchesPrefixes(document: string, query: string): boolean {
  const bounded = query.trim().slice(0, 100);
  if (!bounded) return true;
  const prefixes = words(bounded);
  const lexemes = words(document);
  return prefixes.length > 0 && prefixes.every((prefix) => lexemes.some((word) => word.startsWith(prefix)));
}

function nullableAscending(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

export function fixtureCities(query = "", page = 1): { items: CitySummary[]; total: number } {
  requireFixtureMode();
  const { cities, venues } = inventory();
  const matching = cities.filter((city) => city.status === "active" && matchesPrefixes(`${city.name} ${city.state}`, query))
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase(), "en") || a.id.localeCompare(b.id));
  const offset = (pageNumber(page) - 1) * CITY_PAGE_SIZE;
  const items = matching.slice(offset, offset + CITY_PAGE_SIZE).map((city): CitySummary => {
    const count = venues.filter((venue) => venue.city_id === city.id && venue.status === "published").length;
    return { ...city, published_count: count, total_count: count, draft_count: 0, review_count: 0, cover: null };
  });
  return { items, total: matching.length };
}

export function fixtureCity(slug: string): City | null {
  requireFixtureMode();
  return inventory().cities.find((city) => city.slug === slug && city.status === "active") ?? null;
}

export function fixtureSearch(filters: SearchFilters, cityId?: string): SearchResult {
  requireFixtureMode();
  if (!filters.priceType && (filters.budget !== null || filters.sort === "price")) {
    // Like the RPC, do not compare per-day, per-event and per-plate figures together.
    // Public routes normalize unsupported combinations in parseSearchParams before this call.
    throw new Error("A price basis is required for fixture budgets and price sorting.");
  }
  const { venues } = inventory();
  const page = pageNumber(filters.page);
  const matching = venues.filter((venue) => {
    const price = venue.price_min ?? venue.price_max;
    return venue.status === "published" && venue.city.status === "active"
      && (cityId === undefined || venue.city_id === cityId)
      && (matchesPrefixes(`${venue.name} ${venue.locality ?? ""} ${venue.address ?? ""}`, filters.q)
        || matchesPrefixes(`${venue.city.name} ${venue.city.state}`, filters.q))
      && (filters.capacity === null || (venue.capacity_max !== null && venue.capacity_max >= filters.capacity))
      && (filters.priceType === null || venue.price_type === filters.priceType)
      && (filters.budget === null || (price !== null && price <= filters.budget))
      && (filters.type === null || venue.venue_type === filters.type)
      && filters.facilities.every((facility) => venue.facilities.includes(facility));
  });
  matching.sort((a, b) => {
    let comparison: number;
    switch (filters.sort) {
      case "name": comparison = a.name.toLowerCase().localeCompare(b.name.toLowerCase(), "en"); break;
      case "capacity": comparison = nullableAscending(a.capacity_max, b.capacity_max); break;
      case "price": comparison = nullableAscending(a.price_min ?? a.price_max, b.price_min ?? b.price_max); break;
      default: comparison = b.updated_at.localeCompare(a.updated_at);
    }
    return comparison || a.id.localeCompare(b.id);
  });
  const offset = (page - 1) * PAGE_SIZE;
  return { items: matching.slice(offset, offset + PAGE_SIZE), total: matching.length, page, pageSize: PAGE_SIZE };
}

export function fixtureVenue(citySlug: string, venueSlug: string): PublicVenue | null {
  requireFixtureMode();
  return inventory().venues.find((venue) => venue.city.slug === citySlug && venue.slug === venueSlug
    && venue.city.status === "active" && venue.status === "published") ?? null;
}

export function fixtureFacets(cityId: string): Facets {
  requireFixtureMode();
  const visible = inventory().venues.filter((venue) => venue.city_id === cityId
    && venue.status === "published" && venue.city.status === "active");
  return {
    facilities: [...new Set(visible.flatMap((venue) => venue.facilities))].sort(),
    venueTypes: [...new Set(visible.map((venue) => venue.venue_type))].sort(),
    hasCapacity: visible.some((venue) => venue.capacity_max !== null && venue.capacity_max > 0),
    priceTypes: [...new Set(visible.filter((venue) => (venue.price_min ?? venue.price_max ?? 0) > 0)
      .map((venue) => venue.price_type).filter((type): type is PriceType => type !== null))].sort(),
  };
}

/** Exact, scenario-scoped allowlist. Unknown IDs (including ...000099) are deliberately absent. */
export function fixturePhoto(id: string): Photo | null {
  requireFixtureMode();
  return inventory().venues.flatMap((venue) => venue.photos).find((photo) => photo.id === id) ?? null;
}