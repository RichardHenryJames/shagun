import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { z } from "zod";
import catalogData from "../../data/research/hazaribag-2026-09-08.json";
import type { Database } from "@/lib/db/database.types";
import {
  RESEARCH_BATCH_LIMIT, createResearchRegistry, researchCatalogForCity, researchCatalogKey,
  researchCatalogSchema, researchCatalogSummary, researchMatchesCity, researchSourceNotes,
  researchUrlSchema, researchVenueInput, researchVenueSchema, type ResearchVenueInput,
} from "@/lib/research-catalog";
import { VENUE_STATUSES } from "@/lib/types";
import { uuidSchema, venueSchema } from "@/lib/validation";

const mocks = vi.hoisted(() => ({
  sessionClient: vi.fn<() => Promise<unknown>>(), serviceClient: vi.fn<() => unknown>(),
  rateRpc: vi.fn<(name: string, args: { p_key: string; p_limit: number; p_seconds: number }) => Promise<{ data: boolean | null; error: unknown }>>(),
  revalidatePath: vi.fn<(path: string, type?: "page" | "layout") => void>(),
  revalidateTag: vi.fn<(tag: string, profile: { expire: number }) => void>(),
}));
vi.mock("@/lib/db/clients", () => ({ sessionClient: mocks.sessionClient, serviceClient: mocks.serviceClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath, revalidateTag: mocks.revalidateTag }));

// Exercise the real shared fresh Auth/allowlist checks, scalar form validation,
// safe errors and durable HMAC limiter. Only provider clients/cache are mocked.
import { importResearchAction, researchSummaryForCity } from "@/lib/actions/research";

const ADMIN_ID = "30000000-0000-4000-8000-000000000003";
const CITY_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_CITY_ID = "10000000-0000-4000-8000-000000000002";
const VENUE_ID = "20000000-0000-4000-8000-000000000001";
const PRIVATE_DETAIL = "private-provider-detail-that-must-not-reach-the-admin-form";
const RATE_SECRET = "unit-only-research-budget-key-not-a-real-secret";
const ADMIN = { id: ADMIN_ID, display_name: "Unit-only administrator", is_active: true, created_at: "2026-09-08T00:00:00Z" };
const catalog = researchCatalogSchema.parse(catalogData);
const CATALOG_KEY = researchCatalogKey(catalog);
const SAVED_CITY = { id: CITY_ID, name: catalog.city.name, slug: catalog.city.slug, state: catalog.city.state, country: catalog.city.country };
const payloadKeys = [
  "city_id", "name", "slug", "venue_type", "description", "locality", "address",
  "phone", "alternate_phone", "whatsapp", "email", "capacity_min", "capacity_max",
  "price_min", "price_max", "price_type", "latitude", "longitude", "facilities",
  "status", "verification_status", "verified_at", "seo_title", "seo_description", "source_notes", "reviewed",
].sort();

function withVenue(fields: Record<string, unknown>) {
  return { ...catalogData, venues: [{ ...catalogData.venues[0], ...fields }] };
}
function withSource(fields: Record<string, unknown>) {
  return withVenue({ sources: [{ ...catalogData.venues[0].sources[0], ...fields }] });
}

describe("strict research catalog validation and conservative facts", () => {
  it("contains 12 real researched drafts, with no imported verification, prices or photos", () => {
    expect(catalog.venues).toHaveLength(12);
    expect(RESEARCH_BATCH_LIMIT).toBe(12);
    expect(catalog.researched_on).toBe("2026-09-08");
    expect(catalog.method).toContain("no phone/site visit confirmation");
    expect(new Set(catalog.venues.map((venue) => venue.slug)).size).toBe(12);
    expect(catalog.venues.filter((venue) => venue.phone !== null)).toHaveLength(11);
    expect(catalog.venues.filter((venue) => venue.whatsapp !== null)).toHaveLength(5);
    for (const venue of catalog.venues) {
      expect(venue).toMatchObject({ status: "draft", verification_status: "unverified", verified_at: null,
        photos: [], price_min: null, price_max: null, price_type: null, capacity_min: null, latitude: null, longitude: null });
      expect(venue.sources.some((source) => source.kind === "venue_website" || source.kind === "business_page")).toBe(true);
      for (const source of venue.sources) expect(source.checked_on).toBe("2026-09-08");
    }
  });

  it("retains only Mehfil's explicit 275-guest claim, not ambiguous capacities or room counts", () => {
    expect(catalog.venues.filter((venue) => venue.capacity_max !== null)
      .map((venue) => [venue.slug, venue.capacity_max])).toEqual([["mehfil-banquet", 275]]);
    const mehfil = catalog.venues.find((venue) => venue.slug === "mehfil-banquet");
    expect(mehfil?.review_notes.join(" ")).toContain("not confirmed seated capacity");
    expect(catalog.venues.find((venue) => venue.slug === "hotel-aranya-vihar")?.email).toBeNull();
    expect(catalog.venues.find((venue) => venue.slug === "rings-and-roses-banquet-hall")).toMatchObject({
      phone: null, alternate_phone: null, whatsapp: null, email: null, facilities: [], ready_for_editorial_review: false,
    });
  });

  it.each([
    ["published", { status: "published" }], ["verified", { verification_status: "verified" }],
    ["check date", { verified_at: "2026-09-08" }], ["photos", { photos: ["https://example.org/photo.webp"] }],
    ["review attribution", { reviewed: true }], ["injected notes", { source_notes: PRIVATE_DETAIL }],
    ["venue identifier", { id: VENUE_ID }], ["missing sources", { sources: [] }],
    ["missing review notes", { review_notes: [] }], ["string readiness", { ready_for_editorial_review: "true" }],
    ["numeric phone", { phone: 917717755857 }], ["unqualified phone", { phone: "7717755857" }],
    ["invalid email", { email: "not-an-email" }], ["string capacity", { capacity_max: "275" }],
    ["zero capacity", { capacity_max: 0 }], ["fractional capacity", { capacity_max: 275.5 }],
    ["reversed capacity", { capacity_min: 300, capacity_max: 275 }],
    ["unpaired coordinates", { latitude: 23.5, longitude: null }], ["invalid coordinates", { latitude: 91, longitude: 85 }],
    ["price without basis", { price_min: 1000, price_type: null }],
    ["reversed prices", { price_min: 2000, price_max: 1000, price_type: "per_event" }],
    ["unrecorded facility", { facilities: ["pool"] }], ["duplicate facility", { facilities: ["rooms", "rooms"] }],
  ] satisfies Array<[string, Record<string, unknown>]>) ("rejects %s rather than coercing or discarding it", (_name, fields) => {
    expect(researchCatalogSchema.safeParse(withVenue(fields)).success).toBe(false);
  });

  it("rejects undeclared fields at every catalog object boundary and requires explicit nulls", () => {
    expect(researchCatalogSchema.safeParse({ ...catalogData, city_id: CITY_ID }).success).toBe(false);
    expect(researchCatalogSchema.safeParse({ ...catalogData, city: { ...catalogData.city, status: "active" } }).success).toBe(false);
    expect(researchCatalogSchema.safeParse(withSource({ contact_verified: true })).success).toBe(false);
    const missing: Record<string, unknown> = { ...catalogData.venues[0] };
    delete missing.verified_at;
    expect(researchVenueSchema.safeParse(missing).success).toBe(false);
  });

  it("rejects empty, oversized and duplicate-slug batches", () => {
    expect(researchCatalogSchema.safeParse({ ...catalogData, venues: [] }).success).toBe(false);
    expect(researchCatalogSchema.safeParse({ ...catalogData, venues: [...catalogData.venues, { ...catalogData.venues[0], slug: "unit-only-extra" }] }).success).toBe(false);
    expect(researchCatalogSchema.safeParse({ ...catalogData, venues: [catalogData.venues[0], catalogData.venues[0]] }).success).toBe(false);
  });

  it("requires a primary business source and at least one recorded fact", () => {
    expect(researchCatalogSchema.safeParse(withSource({ kind: "directory" })).success).toBe(false);
    expect(researchCatalogSchema.safeParse(withSource({ facts: [] })).success).toBe(false);
    expect(researchCatalogSchema.safeParse(withSource({ kind: "business_page" })).success).toBe(true);
    expect(researchCatalogSchema.safeParse(withSource({ kind: "venue_website" })).success).toBe(true);
  });

  it.each(["09/08/2026", "2026-02-30", "2026-9-8", "2026-09-08T00:00:00Z", "2026-09-09"])("rejects invalid or post-research source dates: %s", (checked_on) => {
    expect(researchCatalogSchema.safeParse(withSource({ checked_on })).success).toBe(false);
  });

  it("accepts an earlier check but rejects invalid research dates", () => {
    expect(researchCatalogSchema.safeParse(withSource({ checked_on: "2026-09-07" })).success).toBe(true);
    expect(researchCatalogSchema.safeParse({ ...catalogData, researched_on: "2026-02-30" }).success).toBe(false);
  });

  it.each([
    "http://example.org/", "javascript:alert(1)", "data:text/plain,no", "file:///notes", "//example.org/",
    "https://user:password@example.org/", "https://user@example.org/", "https://@example.org/",
    "https://localhost/", "https://localhost./", "https://venue.localhost/", "https://venue.local/", "https://venue.internal/",
    "https://127.0.0.1/", "https://192.0.2.1/", "https://127.1/", "https://2130706433/", "https://0x7f000001/",
    "https://[::1]/", "https://[2001:db8::1]/", "https://example.org\\@localhost/",
    " https://example.org/", "https://example.org/\n", "https://example.org/a b",
  ])("rejects unsafe source and website/gallery references: %s", (url) => {
    expect(researchUrlSchema.safeParse(url).success).toBe(false);
    expect(researchCatalogSchema.safeParse(withSource({ url })).success).toBe(false);
    expect(researchCatalogSchema.safeParse(withVenue({ website_url: url })).success).toBe(false);
    expect(researchCatalogSchema.safeParse(withVenue({ gallery_url: url })).success).toBe(false);
  });

  it("allows ordinary HTTPS business pages, paths, queries and gallery fragments without fetching them", () => {
    for (const url of ["https://example.org/contact", "https://www.example.org/venue?view=gallery#photos", "https://www.facebook.com/example.business/photos"]) {
      expect(researchUrlSchema.safeParse(url).success).toBe(true);
    }
  });

  it.each(["Unit\u00a0venue", "Unit\u202fvenue", "Unit\u0000venue", "Unit\u007fvenue", " Unit venue "])("rejects noncanonical research text: %s", (name) => {
    expect(researchCatalogSchema.safeParse(withVenue({ name })).success).toBe(false);
  });

  it("permits Unicode names with ASCII spaces and preserves ASCII line breaks in notes", () => {
    expect(researchCatalogSchema.safeParse(withVenue({ name: "Unit भवन", review_notes: ["Unit note\nSecond line\twith detail"] })).success).toBe(true);
  });

  it("allows explicitly sourced prices in future catalogs without filling this batch's null prices", () => {
    const priced = researchCatalogSchema.parse(withVenue({ price_min: 10000, price_max: 20000, price_type: "per_event" }));
    expect(researchVenueInput(priced, priced.venues[0], CITY_ID)).toMatchObject({ price_min: 10000, price_max: 20000, price_type: "per_event" });
    expect(catalog.venues.every((venue) => venue.price_min === null && venue.price_max === null && venue.price_type === null)).toBe(true);
  });
});

describe("generic registry, private provenance and whitelisted inputs", () => {
  it("derives a non-UUID dated catalog key from all three geographic identity fields", () => {
    expect(CATALOG_KEY).toBe("research:hazaribag:Jharkhand:India:2026-09-08");
    expect(uuidSchema.safeParse(CATALOG_KEY).success).toBe(false);
    for (const change of [{ slug: "unit-city" }, { state: "Unit State" }, { country: "Unit Country" }]) {
      const other = { ...catalog, city: { ...catalog.city, ...change } };
      expect(researchCatalogKey(other)).not.toBe(CATALOG_KEY);
      expect(researchMatchesCity(other.city, SAVED_CITY)).toBe(false);
    }
    const renamed = { ...SAVED_CITY, name: "An edited display name" };
    expect(researchMatchesCity(catalog.city, renamed)).toBe(true);
  });

  it("matches future admin-created identities without city-name special cases or a fallback batch", () => {
    // Identity permutations are local unit inputs, never added to the server registry.
    const future = { ...catalog, city: { ...catalog.city, name: "Unit-only city", slug: "unit-city", state: "Unit State", country: "Unit Country" } };
    const registry = createResearchRegistry([catalog, future]);
    expect(researchCatalogForCity(registry, future.city)?.city).toEqual(future.city);
    expect(researchCatalogForCity(registry, { ...future.city, state: "Another State" })).toBeNull();
    expect(researchCatalogForCity(registry, { ...future.city, country: "Another Country" })).toBeNull();
    expect(researchCatalogForCity(registry, { ...future.city, slug: "unregistered-city" })).toBeNull();
    expect(researchCatalogForCity(createResearchRegistry([]), SAVED_CITY)).toBeNull();
    expect(() => createResearchRegistry([catalog, catalog])).toThrow(/already registered/);
  });

  it("selects the latest matching dated batch independently of registration order", () => {
    const older = structuredClone(catalog);
    older.researched_on = "2026-09-07";
    for (const venue of older.venues) for (const source of venue.sources) source.checked_on = "2026-09-07";
    for (const inputs of [[older, catalog], [catalog, older]]) {
      expect(researchCatalogForCity(createResearchRegistry(inputs), SAVED_CITY)?.researched_on).toBe("2026-09-08");
    }
  });

  it("returns only primitive summary props with honest field-presence and follow-up counts", () => {
    const summary = researchCatalogSummary(catalog, SAVED_CITY.name);
    expect(summary).toEqual({ catalogKey: CATALOG_KEY, cityName: "Hazaribag", venueCount: 12, researchedOn: "2026-09-08", method: catalog.method,
      sourceCheckedFrom: "2026-09-08", sourceCheckedThrough: "2026-09-08", sourceCount: 27,
      fieldCompleteCount: 11, readyForReviewCount: 7, needsFollowUpCount: 5 });
    expect(Object.values(summary).every((value) => typeof value === "string" || typeof value === "number")).toBe(true);
    for (const venue of catalog.venues) {
      for (const source of venue.sources) expect(JSON.stringify(summary)).not.toContain(source.url);
      for (const note of venue.review_notes) expect(JSON.stringify(summary)).not.toContain(note);
    }
  });

  it("maps every record through venueSchema with only declared database/RPC fields", () => {
    for (const venue of catalog.venues) {
      const input = researchVenueInput(catalog, venue, CITY_ID);
      expect(Object.keys(input).sort()).toEqual(payloadKeys);
      expect(venueSchema.safeParse(input).success).toBe(true);
      expect(input).toMatchObject({ city_id: CITY_ID, slug: venue.slug, name: venue.name, description: venue.description,
        phone: venue.phone, alternate_phone: venue.alternate_phone, whatsapp: venue.whatsapp, email: venue.email,
        capacity_min: venue.capacity_min, capacity_max: venue.capacity_max, facilities: venue.facilities,
        status: "draft", verification_status: "unverified", verified_at: null, reviewed: false,
        seo_title: null, seo_description: null, price_min: null, price_max: null, price_type: null });
      expect(input.source_notes.length).toBeLessThanOrEqual(8000);
      expect(input.source_notes).toContain(`Research reference: ${CATALOG_KEY}:${venue.slug}`);
      expect(input.source_notes).toContain(catalog.method);
      for (const source of venue.sources) {
        expect(input.source_notes).toContain(source.url);
        expect(input.source_notes).toContain(source.publisher);
        expect(input.source_notes).toContain(source.checked_on);
        for (const fact of source.facts) expect(input.source_notes).toContain(fact);
      }
      for (const note of venue.review_notes) expect(input.source_notes).toContain(note);
      if (venue.website_url) expect(input.source_notes).toContain(venue.website_url);
      if (venue.gallery_url) expect(input.source_notes).toContain(venue.gallery_url);
    }
  });

  it("never spreads artifact fields or private notes into descriptions, SEO, metadata or IDs", () => {
    const venue = { ...catalog.venues[0], review_notes: [PRIVATE_DETAIL], id: VENUE_ID, metadata: { notes: PRIVATE_DETAIL }, source_notes: "untrusted override" };
    const input = researchVenueInput(catalog, venue, CITY_ID);
    expect(input.source_notes).toContain(PRIVATE_DETAIL);
    expect(input.source_notes).not.toContain("untrusted override");
    expect(JSON.stringify({ ...input, source_notes: null })).not.toContain(PRIVATE_DETAIL);
    expect(input.description).toBe(venue.description);
    expect(Object.keys(input).sort()).toEqual(payloadKeys);
    expect(() => researchVenueInput(catalog, venue, "not-a-saved-city-uuid")).toThrow(z.ZodError);
  });

  it("accepts exactly 8000 source-note characters and rejects overflow instead of truncating provenance", () => {
    const expanded = structuredClone(catalog);
    const venue = expanded.venues[0];
    venue.review_notes = Array.from({ length: 5 }, () => "x");
    let remaining = 8000 - researchSourceNotes(expanded, venue).length;
    for (let index = 0; index < venue.review_notes.length; index++) {
      const extra = Math.min(1999, remaining);
      venue.review_notes[index] += "x".repeat(extra);
      remaining -= extra;
    }
    expect(remaining).toBe(0);
    expect(researchCatalogSchema.safeParse(expanded).success).toBe(true);
    expect(researchVenueInput(expanded, venue, CITY_ID).source_notes).toHaveLength(8000);
    venue.review_notes.push("x");
    expect(researchCatalogSchema.safeParse(expanded).success).toBe(false);
    expect(() => researchVenueInput(expanded, venue, CITY_ID)).toThrow(z.ZodError);
  });

  it("keeps the raw catalog on the server and leaves the reusable module free of server dependencies", () => {
    const client = readFileSync(new URL("../../src/components/admin/research-import.tsx", import.meta.url), "utf8");
    const pure = readFileSync(new URL("../../src/lib/research-catalog.ts", import.meta.url), "utf8");
    const action = readFileSync(new URL("../../src/lib/actions/research.ts", import.meta.url), "utf8");
    expect(client).toContain('"use client"');
    expect(client).not.toMatch(/from\s+["'][^"']*(?:research-catalog|\.json)["']/);
    expect(pure).not.toMatch(/(?:from|import)\s+["'](?:server-only|node:|next\/|[^"']*\.json)/);
    expect(action).toContain('"use server"');
    expect(action).toContain('import "server-only"');
    expect(action).toContain("data/research/hazaribag-2026-09-08.json");
  });

  it("leaves the normal draft-city seed free of venue, photo and account inserts", () => {
    const seed = readFileSync(new URL("../../supabase/seed.sql", import.meta.url), "utf8");
    expect(seed).toMatch(/insert\s+into\s+shagun\.cities/i);
    expect(seed).toContain("'draft'");
    expect(seed).not.toMatch(/insert\s+into\s+(?:shagun\.|auth\.)?(?:venues|media_assets|admin_users|users)\b/i);
  });
});

type QueryResult = { data: unknown; error: unknown };
interface Query {
  select: Mock<(columns: string) => Query>;
  eq: Mock<(column: string, value: string | boolean) => Query>;
  single: Mock<() => Promise<QueryResult>>;
  maybeSingle: Mock<() => Promise<QueryResult>>;
}
function query(result: QueryResult): Query {
  const builder: Query = {
    select: vi.fn<(columns: string) => Query>(), eq: vi.fn<(column: string, value: string | boolean) => Query>(),
    single: vi.fn<() => Promise<QueryResult>>().mockResolvedValue(result),
    maybeSingle: vi.fn<() => Promise<QueryResult>>().mockResolvedValue(result),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  return builder;
}
const rowKey = (cityId: string, slug: string) => `${cityId}:${slug}`;

function makeSession() {
  const rows = new Map<string, { id: string; data: ResearchVenueInput }>();
  const adminQuery = query({ data: ADMIN, error: null });
  const cityQuery = query({ data: SAVED_CITY, error: null });
  const venueQueries: Query[] = [];
  const lookupResults: QueryResult[] = [];
  const client = {
    auth: { getUser: vi.fn<() => Promise<{ data: { user: { id: string } | null }; error: unknown }>>()
      .mockResolvedValue({ data: { user: { id: ADMIN_ID } }, error: null }) },
    from: vi.fn((table: string): Query => {
      if (table === "admin_users") return adminQuery;
      if (table === "cities") return cityQuery;
      if (table !== "venues") throw new Error("Unexpected table access in research import");
      const lookup = query({ data: null, error: null });
      lookup.maybeSingle.mockImplementation(async () => {
        const override = lookupResults.shift();
        if (override) return override;
        const filters = new Map(lookup.eq.mock.calls);
        const cityId = filters.get("city_id");
        const slug = filters.get("slug");
        if (typeof cityId !== "string" || typeof slug !== "string") throw new Error("Both city and slug predicates are required");
        const existing = rows.get(rowKey(cityId, slug));
        return { data: existing ? { id: existing.id } : null, error: null };
      });
      venueQueries.push(lookup);
      return lookup;
    }),
    rpc: vi.fn<(name: string, args: Database["shagun"]["Functions"]["save_venue"]["Args"]) => Promise<QueryResult>>()
      .mockImplementation(async (name, args) => {
        if (name !== "save_venue" || args.p_id !== null || args.p_expected !== null) throw new Error("Research import must only insert drafts");
        const input = venueSchema.parse(args.p_data);
        const key = rowKey(input.city_id, input.slug);
        if (rows.has(key)) return { data: null, error: { code: "23505", message: PRIVATE_DETAIL } };
        const id = `20000000-0000-4000-8000-${String(rows.size + 1).padStart(12, "0")}`;
        rows.set(key, { id, data: input });
        return { data: id, error: null };
      }),
  };
  return { client, rows, adminQuery, cityQuery, venueQueries, lookupResults };
}
function importForm(values: Record<string, string> = {}): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries({ city_id: CITY_ID, catalog_key: CATALOG_KEY, ...values })) data.set(key, value);
  return data;
}

let session: ReturnType<typeof makeSession>;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("RATE_LIMIT_SECRET", RATE_SECRET);
  session = makeSession();
  mocks.sessionClient.mockResolvedValue(session.client);
  mocks.rateRpc.mockResolvedValue({ data: true, error: null });
  mocks.serviceClient.mockReturnValue({ rpc: mocks.rateRpc });
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("research action authorization, form validation and saved-city identity", () => {
  it("denies unauthenticated imports and summary reads before any inventory access", async () => {
    session.client.auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: PRIVATE_DETAIL } });
    const result = await importResearchAction({}, new FormData());
    expect(result.error).toMatch(/sign in again/i);
    expect(JSON.stringify(result)).not.toContain(PRIVATE_DETAIL);
    expect(await researchSummaryForCity(SAVED_CITY)).toBeNull();
    expect(session.client.from).not.toHaveBeenCalled();
    expect(session.client.rpc).not.toHaveBeenCalled();
    expect(mocks.rateRpc).not.toHaveBeenCalled();
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it.each([null, { ...ADMIN, is_active: false }, { ...ADMIN, id: OTHER_CITY_ID }])("rejects missing, inactive or mismatched current membership", async (admin) => {
    session.adminQuery.maybeSingle.mockResolvedValue({ data: admin, error: null });
    expect((await importResearchAction({}, importForm())).error).toMatch(/sign in again/i);
    expect(await researchSummaryForCity(SAVED_CITY)).toBeNull();
    expect(session.adminQuery.eq).toHaveBeenCalledWith("id", ADMIN_ID);
    expect(session.adminQuery.eq).toHaveBeenCalledWith("is_active", true);
    expect(session.cityQuery.single).not.toHaveBeenCalled();
    expect(session.client.rpc).not.toHaveBeenCalled();
    expect(mocks.rateRpc).not.toHaveBeenCalled();
  });

  it("checks the current allowlist again after a previously successful import", async () => {
    expect((await importResearchAction({}, importForm())).success).toBe(true);
    session.adminQuery.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await importResearchAction({}, importForm())).error).toMatch(/sign in again/i);
    expect(await researchSummaryForCity(SAVED_CITY)).toBeNull();
    expect(mocks.sessionClient).toHaveBeenCalledTimes(3);
    expect(session.client.auth.getUser).toHaveBeenCalledTimes(3);
    expect(session.adminQuery.maybeSingle).toHaveBeenCalledTimes(3);
    expect(session.client.rpc).toHaveBeenCalledTimes(12);
    expect(session.cityQuery.single).toHaveBeenCalledOnce();
  });

  it.each([
    ["city_id", ""], ["city_id", "not-a-uuid"], ["catalog_key", ""],
    ["catalog_key", "../../data/research/forged.json"], ["catalog_key", CITY_ID], ["catalog_key", `${CATALOG_KEY}:forged`],
  ])("rejects an invalid %s before reading the city or writing", async (field, value) => {
    const result = await importResearchAction({}, importForm({ [field]: value }));
    expect(result.fieldErrors?.[field]).toBeDefined();
    expect(session.cityQuery.single).not.toHaveBeenCalled();
    expect(session.client.rpc).not.toHaveBeenCalled();
    expect(mocks.rateRpc).not.toHaveBeenCalled();
  });

  it.each(["city_id", "catalog_key"])("rejects duplicate and File scalar values for %s through shared validation", async (field) => {
    const duplicate = importForm();
    duplicate.append(field, duplicate.get(field) === CITY_ID ? CITY_ID : CATALOG_KEY);
    const file = importForm();
    file.set(field, new Blob(["unit-only non-text value"]), "unit-input.txt");
    for (const form of [duplicate, file]) expect((await importResearchAction({}, form)).fieldErrors?.[field]).toBeDefined();
    expect(session.cityQuery.single).not.toHaveBeenCalled();
    expect(session.client.rpc).not.toHaveBeenCalled();
  });

  it.each([{ slug: "another-city" }, { state: "Another State" }, { country: "Another Country" }])("rejects a forged target even when the saved display name still matches", async (identity) => {
    session.cityQuery.single.mockResolvedValue({ data: { ...SAVED_CITY, id: OTHER_CITY_ID, ...identity }, error: null });
    const result = await importResearchAction({}, importForm({ city_id: OTHER_CITY_ID, slug: SAVED_CITY.slug, state: SAVED_CITY.state, country: SAVED_CITY.country }));
    expect(result.error).toMatch(/does not match the saved city/i);
    expect(result.fieldErrors?.city_id).toBeDefined();
    expect(session.cityQuery.eq).toHaveBeenCalledWith("id", OTHER_CITY_ID);
    expect(session.venueQueries).toHaveLength(0);
    expect(session.client.rpc).not.toHaveBeenCalled();
    expect(mocks.rateRpc).not.toHaveBeenCalled();
    expect(await researchSummaryForCity(SAVED_CITY)).toBeNull();
  });

  it("uses the saved UUID and identity, not a seeded UUID or fixed display name", async () => {
    const renamed = { ...SAVED_CITY, id: OTHER_CITY_ID, name: "Edited city display name" };
    session.cityQuery.single.mockResolvedValue({ data: renamed, error: null });
    expect((await researchSummaryForCity(renamed))?.cityName).toBe(renamed.name);
    expect((await importResearchAction({}, importForm({ city_id: OTHER_CITY_ID }))).success).toBe(true);
    for (const [, args] of session.client.rpc.mock.calls) expect(venueSchema.parse(args.p_data).city_id).toBe(OTHER_CITY_ID);
  });

  it.each([
    { data: null, error: null }, { data: null, error: { code: "PGRST116", message: PRIVATE_DETAIL } },
    { data: { ...SAVED_CITY, id: OTHER_CITY_ID }, error: null },
  ])("fails closed on unavailable or mismatched saved-city results", async (result) => {
    session.cityQuery.single.mockResolvedValue(result);
    const state = await importResearchAction({}, importForm());
    expect(state.error).toBeDefined();
    expect(JSON.stringify(state)).not.toContain(PRIVATE_DETAIL);
    expect(session.client.rpc).not.toHaveBeenCalled();
    expect(mocks.rateRpc).not.toHaveBeenCalled();
  });

  it("returns only a summary for a matching saved city and nothing for an unregistered city", async () => {
    expect(await researchSummaryForCity(SAVED_CITY)).toEqual(researchCatalogSummary(catalog, SAVED_CITY.name));
    const other = { ...SAVED_CITY, slug: "unregistered-city" };
    session.cityQuery.single.mockResolvedValue({ data: other, error: null });
    expect(await researchSummaryForCity(other)).toBeNull();
    expect(session.cityQuery.select).toHaveBeenCalledWith("id,name,slug,state,country");
    expect(session.client.rpc).not.toHaveBeenCalled();
    expect(mocks.rateRpc).not.toHaveBeenCalled();
  });

  it("handles rejected Auth or allowlist lookups without exposing provider details", async () => {
    session.client.auth.getUser.mockRejectedValueOnce(new Error(PRIVATE_DETAIL));
    const authFailure = await importResearchAction({}, importForm());
    session.adminQuery.maybeSingle.mockResolvedValue({ data: ADMIN, error: { message: PRIVATE_DETAIL } });
    const allowlistFailure = await importResearchAction({}, importForm());
    for (const result of [authFailure, allowlistFailure]) {
      expect(result.error).toBeDefined();
      expect(JSON.stringify(result)).not.toContain(PRIVATE_DETAIL);
    }
    expect(session.cityQuery.single).not.toHaveBeenCalled();
    expect(session.client.rpc).not.toHaveBeenCalled();
  });
});

describe("bounded, insert-only research imports", () => {
  it("creates 12 atomic drafts only on explicit submission, then invalidates inventory", async () => {
    expect(session.rows.size).toBe(0);
    const result = await importResearchAction({}, importForm({ status: "published", verification_status: "verified", verified_at: "2026-09-08",
      reviewed: "true", id: VENUE_ID, expected_updated_at: "2026-09-08T00:00:00Z", source_notes: PRIVATE_DETAIL, description: PRIVATE_DETAIL }));
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/Created 12 drafts; skipped 0 existing venues/);
    expect(session.client.auth.getUser).toHaveBeenCalledOnce();
    expect(session.cityQuery.select).toHaveBeenCalledExactlyOnceWith("id,name,slug,state,country");
    expect(session.cityQuery.eq).toHaveBeenCalledExactlyOnceWith("id", CITY_ID);
    expect(session.cityQuery.single).toHaveBeenCalledOnce();
    expect(session.venueQueries).toHaveLength(12);
    expect(session.client.rpc).toHaveBeenCalledTimes(12);
    expect(session.rows.size).toBe(12);
    for (const [index, venue] of catalog.venues.entries()) {
      const lookup = session.venueQueries[index];
      expect(lookup.select).toHaveBeenCalledExactlyOnceWith("id");
      expect(lookup.eq.mock.calls).toEqual([["city_id", CITY_ID], ["slug", venue.slug]]);
      expect(lookup.maybeSingle).toHaveBeenCalledOnce();
      expect(session.client.rpc).toHaveBeenNthCalledWith(index + 1, "save_venue", { p_id: null, p_expected: null, p_data: researchVenueInput(catalog, venue, CITY_ID) });
    }
    expect(new Set(session.client.from.mock.calls.map(([table]) => table))).toEqual(new Set(["admin_users", "cities", "venues"]));
    const digest = createHmac("sha256", RATE_SECRET).update(`admin-research-import:${ADMIN_ID}`).digest("hex");
    expect(mocks.rateRpc).toHaveBeenCalledExactlyOnceWith("consume_rate_limit", { p_key: `admin-research-import:${digest}`, p_limit: 3, p_seconds: 60 });
    expect(session.adminQuery.maybeSingle.mock.invocationCallOrder[0]).toBeLessThan(session.cityQuery.single.mock.invocationCallOrder[0]);
    expect(session.cityQuery.single.mock.invocationCallOrder[0]).toBeLessThan(mocks.rateRpc.mock.invocationCallOrder[0]);
    expect(mocks.rateRpc.mock.invocationCallOrder[0]).toBeLessThan(session.client.rpc.mock.invocationCallOrder[0]);
    expect(mocks.revalidateTag).toHaveBeenCalledExactlyOnceWith("inventory", { expire: 0 });
    expect(mocks.revalidatePath).toHaveBeenCalledExactlyOnceWith("/", "layout");
    expect(session.client.rpc.mock.invocationCallOrder[11]).toBeLessThan(mocks.revalidateTag.mock.invocationCallOrder[0]);
    expect(JSON.stringify(result)).not.toContain(PRIVATE_DETAIL);
  });

  it("is idempotent on repeated submissions without additional writes or review changes", async () => {
    await importResearchAction({}, importForm());
    const saved = structuredClone(session.rows);
    const result = await importResearchAction({}, importForm());
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/Created 0 drafts; skipped 12 existing venues/);
    expect(session.rows).toEqual(saved);
    expect(session.client.rpc).toHaveBeenCalledTimes(12);
    expect(mocks.revalidateTag).toHaveBeenCalledOnce();
    expect(session.client.auth.getUser).toHaveBeenCalledTimes(2);
  });

  it.each(VENUE_STATUSES)("preserves every existing %s record, its edits, facilities and research", async (status) => {
    const venue = catalog.venues[0];
    const edited: ResearchVenueInput = { ...researchVenueInput(catalog, venue, CITY_ID), status,
      description: "Unit-only operator-edited description", source_notes: PRIVATE_DETAIL, facilities: ["accessible_entry"], reviewed: true };
    const existing = { id: VENUE_ID, data: edited };
    session.rows.set(rowKey(CITY_ID, venue.slug), structuredClone(existing));
    const result = await importResearchAction({}, importForm());
    expect(result.message).toMatch(/Created 11 drafts; skipped 1 existing venue/);
    expect(session.rows.get(rowKey(CITY_ID, venue.slug))).toEqual(existing);
    expect(session.client.rpc).toHaveBeenCalledTimes(11);
    for (const [, args] of session.client.rpc.mock.calls) {
      expect(args.p_id).toBeNull();
      expect(venueSchema.parse(args.p_data).slug).not.toBe(venue.slug);
    }
    expect(JSON.stringify(result)).not.toContain(PRIVATE_DETAIL);
  });

  it("does not mistake the same venue slug in another city for an existing target", async () => {
    const venue = catalog.venues[0];
    const other = { id: VENUE_ID, data: researchVenueInput(catalog, venue, OTHER_CITY_ID) };
    session.rows.set(rowKey(OTHER_CITY_ID, venue.slug), other);
    expect((await importResearchAction({}, importForm())).message).toMatch(/Created 12 drafts; skipped 0/);
    expect(session.rows.get(rowKey(OTHER_CITY_ID, venue.slug))).toEqual(other);
    expect(session.rows.size).toBe(13);
  });

  it.each(["response", "rejection"])("skips a concurrent 23505 insert %s without overwriting the winning editor", async (kind) => {
    session.client.rpc.mockImplementationOnce(async (_name, args) => {
      const input = venueSchema.parse(args.p_data);
      session.rows.set(rowKey(input.city_id, input.slug), { id: VENUE_ID, data: { ...input, description: PRIVATE_DETAIL } });
      const error = { code: "23505", message: PRIVATE_DETAIL };
      if (kind === "rejection") throw error;
      return { data: null, error };
    });
    const result = await importResearchAction({}, importForm());
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/Created 11 drafts; skipped 1 existing venue/);
    expect(session.rows.get(rowKey(CITY_ID, catalog.venues[0].slug))?.data.description).toBe(PRIVATE_DETAIL);
    expect(session.client.rpc).toHaveBeenCalledTimes(12);
    expect(session.client.rpc.mock.calls.every(([, args]) => args.p_id === null && args.p_expected === null)).toBe(true);
    expect(JSON.stringify(result)).not.toContain(PRIVATE_DETAIL);
  });

  it.each(["XX000", "23514", "42501", "23503", "P0001"])("stops on a fatal %s error and reports and invalidates partial progress", async (code) => {
    const venue = catalog.venues[0];
    session.rows.set(rowKey(CITY_ID, venue.slug), { id: VENUE_ID, data: researchVenueInput(catalog, venue, CITY_ID) });
    session.client.rpc.mockResolvedValueOnce({ data: VENUE_ID, error: null })
      .mockResolvedValueOnce({ data: null, error: { code, message: PRIVATE_DETAIL, details: PRIVATE_DETAIL, hint: PRIVATE_DETAIL } });
    const result = await importResearchAction({}, importForm());
    expect(result.success).not.toBe(true);
    expect(result.error).toMatch(/Created 1 draft; skipped 1 existing venue/);
    expect(result.error).toMatch(/before retrying/i);
    expect(JSON.stringify(result)).not.toContain(PRIVATE_DETAIL);
    expect(session.client.rpc).toHaveBeenCalledTimes(2);
    expect(session.venueQueries).toHaveLength(3);
    expect(mocks.revalidateTag).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledOnce();
  });

  it("stops on a rejected RPC without retrying or treating message text as a uniqueness code", async () => {
    session.client.rpc.mockResolvedValueOnce({ data: VENUE_ID, error: null })
      .mockRejectedValueOnce(new Error(`23505 ${PRIVATE_DETAIL}`));
    const result = await importResearchAction({}, importForm());
    expect(result.error).toMatch(/Created 1 draft; skipped 0 existing venues/);
    expect(JSON.stringify(result)).not.toContain(PRIVATE_DETAIL);
    expect(session.client.rpc).toHaveBeenCalledTimes(2);
    expect(session.venueQueries).toHaveLength(2);
    expect(mocks.revalidateTag).toHaveBeenCalledOnce();
  });

  it.each(["XX000", "23505"])("fails closed on a %s lookup error, never counting it as a concurrent insert", async (code) => {
    session.lookupResults.push({ data: null, error: { code, message: PRIVATE_DETAIL } });
    const result = await importResearchAction({}, importForm());
    expect(result.error).toMatch(/Created 0 drafts; skipped 0 existing venues/);
    expect(JSON.stringify(result)).not.toContain(PRIVATE_DETAIL);
    expect(session.venueQueries).toHaveLength(1);
    expect(session.client.rpc).not.toHaveBeenCalled();
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("invalidates known partial progress when a later existence lookup fails", async () => {
    session.lookupResults.push({ data: null, error: null }, { data: null, error: { code: "XX000", message: PRIVATE_DETAIL } });
    const result = await importResearchAction({}, importForm());
    expect(result.error).toMatch(/Created 1 draft; skipped 0/);
    expect(session.rows.size).toBe(1);
    expect(session.client.rpc).toHaveBeenCalledOnce();
    expect(session.venueQueries).toHaveLength(2);
    expect(mocks.revalidateTag).toHaveBeenCalledOnce();
  });

  it.each([null, "not-a-uuid"])("stops on an unconfirmed save result without inventing a created count", async (data) => {
    session.client.rpc.mockResolvedValueOnce({ data, error: null });
    const result = await importResearchAction({}, importForm());
    expect(result.error).toMatch(/Created 0 drafts; skipped 0/);
    expect(result.error).toMatch(/could not be fully confirmed/i);
    expect(session.client.rpc).toHaveBeenCalledOnce();
    expect(session.venueQueries).toHaveLength(1);
    expect(mocks.revalidateTag).toHaveBeenCalledOnce();
  });

  it.each(["exhausted", "unavailable", "unconfigured"])("fails closed on an %s durable research budget", async (kind) => {
    if (kind === "unconfigured") vi.stubEnv("RATE_LIMIT_SECRET", "");
    else mocks.rateRpc.mockResolvedValue({ data: false, error: kind === "unavailable" ? { message: PRIVATE_DETAIL } : null });
    const result = await importResearchAction({}, importForm());
    expect(result.error).toMatch(kind === "exhausted" ? /too many attempts/i : /temporarily unavailable/i);
    expect(JSON.stringify(result)).not.toContain(PRIVATE_DETAIL);
    expect(session.venueQueries).toHaveLength(0);
    expect(session.client.rpc).not.toHaveBeenCalled();
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("reports confirmed saves even if cache invalidation fails, without replaying writes", async () => {
    mocks.revalidateTag.mockImplementationOnce(() => { throw new Error(PRIVATE_DETAIL); });
    const result = await importResearchAction({}, importForm());
    expect(result.success).not.toBe(true);
    expect(result.error).toMatch(/Created 12 drafts; skipped 0/);
    expect(JSON.stringify(result)).not.toContain(PRIVATE_DETAIL);
    expect(session.client.rpc).toHaveBeenCalledTimes(12);
    expect(session.rows.size).toBe(12);
  });
});