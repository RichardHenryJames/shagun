import { z } from "zod";
import { FACILITY_CODES, PRICE_TYPES, VENUE_TYPES, type City } from "@/lib/types";
import { slugSchema, venueSchema } from "@/lib/validation";

// Pure, deterministic validation/mapping for server administration and a future
// explicit CLI. No catalog import, server-only marker, I/O or database IDs here.
export const RESEARCH_BATCH_LIMIT = 12;
const SOURCE_NOTES_LIMIT = 8000;
const text = (max: number, min = 1) => z.string().min(min).max(max)
  .refine((value) => value === value.trim(), "Remove leading and trailing whitespace.")
  .refine((value) => !/[^\S \t\r\n]/u.test(value), "Use ASCII whitespace in research text.")
  .refine((value) => Array.from(value).every((character) => {
    const code = character.charCodeAt(0);
    return (code >= 32 && code !== 127) || character === "\t" || character === "\r" || character === "\n";
  }), "Remove control characters from research text.");

/** References only, never fetch targets. URL parsing also normalizes numeric IP aliases. */
export const researchUrlSchema = z.string().max(2048).refine((value) => {
  if (!/^https:\/\//i.test(value) || /[\s\\]/u.test(value)
    || Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    const authority = value.slice("https://".length).split(/[/?#]/, 1)[0];
    return url.protocol === "https:" && !url.username && !url.password && !authority.includes("@")
      && host.length <= 253
      && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(host)
      && !/(?:^|\.)(?:localhost|local|internal)$/.test(host);
  } catch {
    return false;
  }
}, "Use an HTTPS public website URL without credentials, an IP address or a local hostname.");

export const researchSourceSchema = z.object({
  url: researchUrlSchema,
  publisher: text(180),
  kind: z.enum(["venue_website", "business_page", "directory"]),
  checked_on: z.iso.date(),
  facts: z.array(text(1000)).min(1).max(20),
}).strict();

const researchCitySchema = z.object({
  name: text(100, 2), slug: slugSchema, state: text(100, 2), country: text(100, 2),
  description: text(2000).nullable(), seo_title: text(70).nullable(), seo_description: text(180).nullable(),
}).strict();
const phone = z.string().regex(/^\+[1-9]\d{7,14}$/, "Use a recorded business number with its country code.").nullable();
const capacity = z.number().int().min(1).max(100000).nullable();
const price = z.number().min(1).max(100000000).nullable();

export const researchVenueSchema = z.object({
  name: text(180, 2), slug: slugSchema, venue_type: z.enum(VENUE_TYPES),
  description: text(8000).nullable(), locality: text(150).nullable(), address: text(600).nullable(),
  phone, alternate_phone: phone, whatsapp: phone, email: z.email().max(254).nullable(),
  capacity_min: capacity, capacity_max: capacity,
  price_min: price, price_max: price, price_type: z.enum(PRICE_TYPES).nullable(),
  latitude: z.number().min(-90).max(90).nullable(), longitude: z.number().min(-180).max(180).nullable(),
  facilities: z.array(z.enum(FACILITY_CODES)).max(FACILITY_CODES.length),
  website_url: researchUrlSchema.nullable(), gallery_url: researchUrlSchema.nullable(),
  sources: z.array(researchSourceSchema).min(1).max(12),
  review_notes: z.array(text(2000)).min(1).max(20),
  ready_for_editorial_review: z.boolean(),
  photos: z.array(z.never()).max(0),
  verified_at: z.null(), verification_status: z.literal("unverified"), status: z.literal("draft"),
}).strict().superRefine((venue, context) => {
  if (!venue.sources.some((source) => source.kind === "venue_website" || source.kind === "business_page")) {
    context.addIssue({ code: "custom", path: ["sources"], message: "Include at least one venue website or business-page source." });
  }
  if (new Set(venue.facilities).size !== venue.facilities.length) {
    context.addIssue({ code: "custom", path: ["facilities"], message: "Record each facility only once." });
  }
  if (venue.capacity_min !== null && venue.capacity_max !== null && venue.capacity_min > venue.capacity_max) {
    context.addIssue({ code: "custom", path: ["capacity_max"], message: "Maximum capacity must be at least the minimum." });
  }
  if (venue.price_min !== null && venue.price_max !== null && venue.price_min > venue.price_max) {
    context.addIssue({ code: "custom", path: ["price_max"], message: "Maximum price must be at least the minimum." });
  }
  if ((venue.price_min !== null || venue.price_max !== null) && venue.price_type === null) {
    context.addIssue({ code: "custom", path: ["price_type"], message: "Recorded prices need a price basis." });
  }
  if ((venue.latitude === null) !== (venue.longitude === null)) {
    context.addIssue({ code: "custom", path: ["longitude"], message: "Record both coordinates or neither." });
  }
});

const catalogShape = z.object({
  city: researchCitySchema, researched_on: z.iso.date(), method: text(500),
  venues: z.array(researchVenueSchema).min(1).max(RESEARCH_BATCH_LIMIT),
}).strict();

export type ResearchVenue = z.infer<typeof researchVenueSchema>;
export type ResearchCatalog = z.infer<typeof catalogShape>;
export type ResearchCityPick = Pick<City, "slug" | "state" | "country">;
export type ResearchRegistry = ReadonlyMap<string, ResearchCatalog>;
export type ResearchVenueInput = z.output<typeof venueSchema>;

export function researchCatalogKey(catalog: Pick<ResearchCatalog, "city" | "researched_on">): string {
  const { slug, state, country } = catalog.city;
  return `research:${slug}:${encodeURIComponent(state)}:${encodeURIComponent(country)}:${catalog.researched_on}`;
}

/** Display names are editable, not geographic identity. Fail closed on any mismatch. */
export function researchMatchesCity(catalogCity: ResearchCityPick, savedCity: ResearchCityPick): boolean {
  return catalogCity.slug === savedCity.slug && catalogCity.state === savedCity.state && catalogCity.country === savedCity.country;
}

/** Lossless private provenance: exceeding the cap is an error, never a truncation. */
export function researchSourceNotes(catalog: ResearchCatalog, venue: ResearchVenue): string {
  return [
    `Research reference: ${researchCatalogKey(catalog)}:${venue.slug}`,
    `City: ${catalog.city.name}, ${catalog.city.state}, ${catalog.city.country}`,
    `Researched on: ${catalog.researched_on}`,
    `Method: ${catalog.method}`,
    "Source-page checks are not direct contact or site-visit verification. Editorial review has not been performed by this import.",
    `Research readiness: ${venue.ready_for_editorial_review ? "marked for editorial review" : "source follow-up needed before editorial review"}.`,
    ...(venue.website_url ? [`Website reference: ${venue.website_url}`] : []),
    ...(venue.gallery_url ? [`Gallery reference (not permission to reuse images): ${venue.gallery_url}`] : []),
    "", "Sources:",
    ...venue.sources.flatMap((source, index) => [
      `${index + 1}. ${source.publisher} (${source.kind}); page checked ${source.checked_on}`,
      source.url, ...source.facts.map((fact) => `- ${fact}`),
    ]),
    "", "Private review notes:", ...venue.review_notes.map((note) => `- ${note}`),
  ].join("\n");
}

export const researchCatalogSchema = catalogShape.superRefine((catalog, context) => {
  const slugs = new Set<string>();
  for (const [index, venue] of catalog.venues.entries()) {
    if (slugs.has(venue.slug)) {
      context.addIssue({ code: "custom", path: ["venues", index, "slug"], message: "Venue slugs must be unique within a research batch." });
    }
    slugs.add(venue.slug);
    for (const [sourceIndex, source] of venue.sources.entries()) {
      // Valid ISO dates sort chronologically without parsing or stamping a Date.
      if (source.checked_on > catalog.researched_on) {
        context.addIssue({ code: "custom", path: ["venues", index, "sources", sourceIndex, "checked_on"], message: "A source check cannot follow the batch's research date." });
      }
    }
    if (researchSourceNotes(catalog, venue).length > SOURCE_NOTES_LIMIT) {
      context.addIssue({ code: "custom", path: ["venues", index, "review_notes"], message: "Combined private source notes must not exceed 8000 characters." });
    }
  }
});

export function createResearchRegistry(inputs: readonly unknown[]): ResearchRegistry {
  const registry = new Map<string, ResearchCatalog>();
  for (const input of inputs) {
    const catalog = researchCatalogSchema.parse(input);
    const key = researchCatalogKey(catalog);
    if (registry.has(key)) throw new Error("A research batch with this city identity and date is already registered.");
    registry.set(key, catalog);
  }
  return registry;
}

/** Latest registered batch for this exact saved identity; never a default city. */
export function researchCatalogForCity(registry: ResearchRegistry, city: ResearchCityPick): ResearchCatalog | null {
  let latest: ResearchCatalog | null = null;
  for (const catalog of registry.values()) {
    if (researchMatchesCity(catalog.city, city) && (!latest || catalog.researched_on > latest.researched_on)) latest = catalog;
  }
  return latest;
}

/** Flat, non-provenance props only. Field completeness means address + contact presence, not verification. */
export interface ResearchSummary {
  catalogKey: string; cityName: string; venueCount: number; researchedOn: string; method: string;
  sourceCheckedFrom: string; sourceCheckedThrough: string; sourceCount: number;
  fieldCompleteCount: number; readyForReviewCount: number; needsFollowUpCount: number;
}

export function researchCatalogSummary(catalog: ResearchCatalog, cityName: string): ResearchSummary {
  const sourceDates = catalog.venues.flatMap((venue) => venue.sources.map((source) => source.checked_on)).sort();
  const readyForReviewCount = catalog.venues.filter((venue) => venue.ready_for_editorial_review).length;
  return {
    catalogKey: researchCatalogKey(catalog), cityName, venueCount: catalog.venues.length,
    researchedOn: catalog.researched_on, method: catalog.method,
    sourceCheckedFrom: sourceDates[0], sourceCheckedThrough: sourceDates[sourceDates.length - 1], sourceCount: sourceDates.length,
    fieldCompleteCount: catalog.venues.filter((venue) => venue.address !== null
      && [venue.phone, venue.alternate_phone, venue.whatsapp, venue.email].some((contact) => contact !== null)).length,
    readyForReviewCount, needsFollowUpCount: catalog.venues.length - readyForReviewCount,
  };
}

/** Call with a validated catalog and a matched, saved city's UUID. Never supplies a venue ID. */
export function researchVenueInput(catalog: ResearchCatalog, venue: ResearchVenue, cityId: string): ResearchVenueInput {
  const result = venueSchema.safeParse({
    city_id: cityId, name: venue.name, slug: venue.slug, venue_type: venue.venue_type,
    description: venue.description, locality: venue.locality, address: venue.address,
    phone: venue.phone, alternate_phone: venue.alternate_phone, whatsapp: venue.whatsapp, email: venue.email,
    capacity_min: venue.capacity_min, capacity_max: venue.capacity_max,
    price_min: venue.price_min, price_max: venue.price_max, price_type: venue.price_type,
    latitude: venue.latitude, longitude: venue.longitude, facilities: [...venue.facilities],
    status: "draft", verification_status: "unverified", verified_at: null,
    seo_title: null, seo_description: null, source_notes: researchSourceNotes(catalog, venue), reviewed: false,
  });
  if (!result.success) throw result.error;
  return result.data;
}