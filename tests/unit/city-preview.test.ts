import { readFileSync } from "node:fs";
import { createElement, type AnchorHTMLAttributes } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { City, CitySummary, Facets, Photo, PublicVenue, SearchResult } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  sessionClient: vi.fn(), anonymousClient: vi.fn(), serviceClient: vi.fn(), fetch: vi.fn<typeof fetch>(),
  redirect: vi.fn(), notFound: vi.fn(), revalidatePath: vi.fn(), revalidateTag: vi.fn(),
  redirectSignal: new Error("Unit-only redirect control flow"), missingSignal: new Error("Unit-only not-found control flow"),
}));
vi.mock("@/lib/db/clients", () => ({ sessionClient: mocks.sessionClient, anonymousClient: mocks.anonymousClient, serviceClient: mocks.serviceClient }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath, revalidateTag: mocks.revalidateTag, unstable_cache: (callback: unknown) => callback }));
vi.mock("next/link", () => ({ default: ({ prefetch, children, ...attributes }: AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => {
  void prefetch;
  return createElement("a", attributes, children);
} }));

// Real Auth/active-allowlist helpers, server catalog validation, repositories and
// UI; only provider clients/navigation are mocked. No runtime preview bypass.
import { saveCityAction } from "@/lib/actions/cities";
import { getCatalogCity, getCatalogStates } from "@/lib/city-catalog";
import { getAdminCityPreview } from "@/lib/data/admin";
import { DataUnavailableError } from "@/lib/data/errors";
import { parseSearchParams } from "@/lib/validation";
import { CityForm } from "@/components/admin/city-form";
import { CityPicker } from "@/components/admin/city-picker";
import { CityDiscovery } from "@/components/public/city-discovery";
import CityPreviewPage, { dynamic, fetchCache, metadata, revalidate } from "@/app/admin/(protected)/cities/[city]/preview/page";
import PublicCityPage, { generateMetadata } from "@/app/(public)/city/[city]/page";

const CITY_ID = "10000000-0000-4000-8000-000000000001";
const VENUE_ID = "20000000-0000-4000-8000-000000000002";
const ADMIN_ID = "30000000-0000-4000-8000-000000000003";
const PHOTO_ID = "40000000-0000-4000-8000-000000000004";
const COVER_ID = "50000000-0000-4000-8000-000000000005";
const ROOT_ID = "60000000-0000-4000-8000-000000000006";
const OTHER_ID = "70000000-0000-4000-8000-000000000007";
const VERSION = "2026-09-08T09:10:11.123456+05:30";
const CHAPRA = "geonames:1274353";
const HAZARIBAGH = "geonames:1270164";
const RETIRED_SOURCE = "geonames:999999999999999";
const PRIVATE = "Unit-only private research/provider detail";
const ADMIN = { id: ADMIN_ID, display_name: "Unit-only administrator", is_active: true, created_at: VERSION };

// Every inventory/photo record here is synthetic, local unit data only. The
// source-city IDs in catalog tests refer to the real, checked-in GeoNames data.
const CITY: City = {
  id: CITY_ID, name: "Unit City", slug: "unit-city", state: "Unit State", country: "India", description: "Unit-only city introduction.",
  status: "draft", metadata: {}, seo_title: null, seo_description: null, launched_at: null, created_at: VERSION, updated_at: VERSION,
};
const PHOTO: Photo = {
  id: PHOTO_ID, venue_id: VENUE_ID, city_id: null, storage_key: ROOT_ID, alt_text: "Unit-only venue image", credit: "Unit-only rights fixture",
  width: 960, height: 640, sort_order: 0, is_cover: true, created_at: VERSION,
};
const COVER: Photo = { ...PHOTO, id: COVER_ID, venue_id: null, city_id: CITY_ID, alt_text: "Unit-only city cover" };
const VENUE: PublicVenue = {
  id: VENUE_ID, city_id: CITY_ID, name: "Unit Venue", slug: "unit-venue", description: null, venue_type: "banquet_hall", address: null, locality: "Unit locality",
  phone: null, alternate_phone: null, whatsapp: null, email: null, capacity_min: 100, capacity_max: 300, price_min: 1000, price_max: 2000,
  price_type: "per_event", latitude: null, longitude: null, status: "draft", verification_status: "unverified", verified_at: null, published_at: null,
  seo_title: null, seo_description: null, created_at: VERSION, updated_at: VERSION, city: CITY, photos: [PHOTO], facilities: ["parking"],
};
const FACETS: Facets = { facilities: ["parking", "ac"], venueTypes: ["banquet_hall", "hotel"], hasCapacity: true, priceTypes: ["per_event", "per_plate"] };
const RESULT: SearchResult = { items: [VENUE], total: 38, page: 1, pageSize: 12 };
type ResponseData = { data: unknown; error: { code?: string; message: string } | null; count?: number | null };

function query(response: ResponseData) {
  const pending = Promise.resolve(response);
  const builder = {
    select: vi.fn(), eq: vi.fn(), in: vi.fn(), order: vi.fn(), limit: vi.fn(),
    maybeSingle: vi.fn<() => Promise<ResponseData>>().mockResolvedValue(response), then: pending.then.bind(pending),
  };
  for (const key of ["select", "eq", "in", "order", "limit"] as const) builder[key].mockReturnValue(builder);
  return builder;
}
function sessionFixture() {
  const allowlist = query({ data: ADMIN, error: null });
  const savedCity = query({ data: structuredClone(CITY), error: null });
  const countResponse: ResponseData = { data: null, count: 101, error: null };
  const inventory = query(countResponse);
  const cover = query({ data: structuredClone(COVER), error: null });
  const searchResponse: ResponseData = { data: structuredClone(RESULT), error: null };
  const facetsResponse: ResponseData = { data: structuredClone(FACETS), error: null };
  const saveResponse: ResponseData = { data: CITY_ID, error: null };
  const client = {
    auth: { getUser: vi.fn<() => Promise<{ data: { user: { id: string } | null }; error: unknown }>>()
      .mockResolvedValue({ data: { user: { id: ADMIN_ID } }, error: null }) },
    from: vi.fn((table: string) => {
      if (table === "admin_users") return allowlist;
      if (table === "cities") return savedCity;
      if (table === "venues") return inventory;
      if (table === "media_assets") return cover;
      throw new Error("Unexpected private table read in city preview tests.");
    }),
    rpc: vi.fn<(name: string, args: Record<string, unknown>) => Promise<ResponseData>>().mockImplementation(async (name) => {
      if (name === "preview_city_venues") return searchResponse;
      if (name === "preview_city_facets") return facetsResponse;
      if (name === "save_city") return saveResponse;
      throw new Error("No public/list fallback RPC is permitted in a private preview.");
    }),
  };
  return { client, allowlist, savedCity, inventory, cover, searchResponse, facetsResponse, countResponse, saveResponse };
}
let session: ReturnType<typeof sessionFixture>;
beforeEach(() => {
  vi.resetAllMocks();
  session = sessionFixture();
  mocks.sessionClient.mockResolvedValue(session.client);
  mocks.redirect.mockImplementation(() => { throw mocks.redirectSignal; });
  mocks.notFound.mockImplementation(() => { throw mocks.missingSignal; });
  mocks.anonymousClient.mockImplementation(() => { throw new Error("Anonymous access is not permitted in private preview tests."); });
  mocks.serviceClient.mockImplementation(() => { throw new Error("Service-role access is not permitted in city selection/preview tests."); });
  mocks.fetch.mockImplementation(async () => { throw new Error("No real network calls in city selection/preview unit tests."); });
  vi.stubGlobal("fetch", mocks.fetch);
  for (const [name, value] of Object.entries({
    NEXT_PUBLIC_SUPABASE_URL: "https://unit-database.example.test", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "unit-only-key",
    NEXT_PUBLIC_SITE_URL: "https://unit-shagun.example.test", SHAGUN_TEST_FIXTURES: "false", NEXT_PUBLIC_ANALYTICS_ENABLED: "false",
  })) vi.stubEnv(name, value);
});
afterEach(() => {
  expect(mocks.serviceClient).not.toHaveBeenCalled();
  expect(mocks.fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals(); vi.unstubAllEnvs();
});
function cityForm(overrides: Record<string, string> = {}) {
  const fields = { id: "", expected_updated_at: "", catalog_id: "", name: CITY.name, slug: CITY.slug, state: CITY.state, country: CITY.country, status: "draft", metadata: "", ...overrides };
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  return form;
}
function linkedCity() {
  const city: City = { ...CITY, name: "Hazaribag", slug: "hazaribag", state: "Jharkhand", metadata: { geographic_source_id: HAZARIBAGH, public_label: "Unit-only saved attribute" } };
  session.savedCity.maybeSingle.mockResolvedValue({ data: city, error: null });
  return city;
}

describe("server-validated city catalog selection", () => {
  it("derives all required geography from the selected Chapra ID, without requiring manual names", async () => {
    await expect(saveCityAction({}, cityForm({ catalog_id: CHAPRA, name: "", state: "", country: "", slug: "" }))).rejects.toBe(mocks.redirectSignal);
    expect(session.client.rpc).toHaveBeenCalledExactlyOnceWith("save_city", {
      p_id: null, p_expected: null, p_data: expect.objectContaining({ name: "Chapra", state: "Bihar", country: "India", slug: "chapra", status: "draft", metadata: { geographic_source_id: CHAPRA } }),
    });
    expect(mocks.redirect).toHaveBeenCalledWith("/admin/cities/chapra/edit");
    expect(session.client.from.mock.calls.map(([name]) => name)).toEqual(["admin_users"]);
    expect(getCatalogStates()).toHaveLength(36);
  });

  it("allows an editorial spelling and explicit unlocked slug, while retaining the catalog's state and India", async () => {
    await expect(saveCityAction({}, cityForm({ catalog_id: HAZARIBAGH, name: "Hazaribag", state: "Jharkhand", slug: "hazaribag" }))).rejects.toBe(mocks.redirectSignal);
    expect(session.client.rpc).toHaveBeenCalledWith("save_city", expect.objectContaining({ p_data: expect.objectContaining({ name: "Hazaribag", state: "Jharkhand", country: "India", slug: "hazaribag", metadata: { geographic_source_id: HAZARIBAGH } }) }));
  });

  it.each(["geonames:0001", "1274353", RETIRED_SOURCE, "__proto__"])("rejects an invalid/unknown selected ID %s before a save", async (catalog_id) => {
    expect((await saveCityAction({}, cityForm({ catalog_id }))).fieldErrors?.catalog_id).toBeDefined();
    expect(session.client.rpc).not.toHaveBeenCalled();
  });

  it.each(["duplicate", "file"])("rejects a %s catalog_id rather than choosing a value", async (kind) => {
    const form = cityForm({ catalog_id: CHAPRA });
    if (kind === "duplicate") form.append("catalog_id", HAZARIBAGH);
    else form.set("catalog_id", new Blob([CHAPRA]), "unit.txt");
    expect((await saveCityAction({}, form)).fieldErrors?.catalog_id).toBeDefined();
    expect(session.client.rpc).not.toHaveBeenCalled();
  });

  it.each([ ["state", "Jharkhand"], ["country", "Unit Other Country"] ])("rejects forged %s for a selected source", async (key, value) => {
    const result = await saveCityAction({}, cityForm({ catalog_id: CHAPRA, state: "Bihar", [key]: value }));
    expect(result.fieldErrors?.[key]).toBeDefined();
    expect(session.client.rpc).not.toHaveBeenCalled();
  });

  it.each([null, 1274353, HAZARIBAGH])("rejects the forged reserved metadata scalar %j", async (source) => {
    const result = await saveCityAction({}, cityForm({ catalog_id: CHAPRA, state: "Bihar", metadata: JSON.stringify({ geographic_source_id: source }) }));
    expect(result.fieldErrors?.metadata).toBeDefined();
    expect(session.client.rpc).not.toHaveBeenCalled();
  });

  it("does not accept metadata as an alternative selection authority", async () => {
    expect((await saveCityAction({}, cityForm({ metadata: JSON.stringify({ geographic_source_id: CHAPRA }) }))).fieldErrors?.metadata).toBeDefined();
    expect(session.client.rpc).not.toHaveBeenCalled();
  });

  it("allows ordinary manual creates and existing manual edits without attaching a catalog city", async () => {
    await expect(saveCityAction({}, cityForm())).rejects.toBe(mocks.redirectSignal);
    await expect(saveCityAction({}, cityForm({ id: CITY_ID, expected_updated_at: VERSION, metadata: '{"label":"Unit-only edit"}' }))).rejects.toBe(mocks.redirectSignal);
    expect(session.savedCity.eq).toHaveBeenCalledWith("id", CITY_ID);
    expect(session.client.rpc).toHaveBeenLastCalledWith("save_city", expect.objectContaining({ p_expected: VERSION, p_data: expect.objectContaining({ metadata: { label: "Unit-only edit" } }) }));
  });

  it("preserves a saved source when an older form omits it, without changing the optimistic timestamp", async () => {
    const city = linkedCity();
    const form = cityForm({ id: CITY_ID, expected_updated_at: VERSION, name: city.name, slug: city.slug, state: city.state, metadata: '{"public_label":"Unit-only edit"}' });
    form.delete("catalog_id");
    await expect(saveCityAction({}, form)).rejects.toBe(mocks.redirectSignal);
    expect(session.client.rpc).toHaveBeenCalledExactlyOnceWith("save_city", expect.objectContaining({ p_id: CITY_ID, p_expected: VERSION,
      p_data: expect.objectContaining({ name: "Hazaribag", slug: "hazaribag", metadata: { public_label: "Unit-only edit", geographic_source_id: HAZARIBAGH } }),
    }));
  });

  it("does not allow an existing source association to be replaced or removed through metadata", async () => {
    const city = linkedCity();
    const original = { id: CITY_ID, expected_updated_at: VERSION, name: city.name, slug: city.slug, state: city.state };
    expect((await saveCityAction({}, cityForm({ ...original, catalog_id: CHAPRA }))).fieldErrors?.catalog_id).toBeDefined();
    expect((await saveCityAction({}, cityForm({ ...original, metadata: '{"geographic_source_id":null}' }))).fieldErrors?.metadata).toBeDefined();
    expect(session.client.rpc).not.toHaveBeenCalled();
  });

  it("preserves a retired source on unrelated edits but rejects a geographic change", async () => {
    expect(getCatalogCity(RETIRED_SOURCE)).toBeNull();
    session.savedCity.maybeSingle.mockResolvedValue({ data: { ...CITY, metadata: { geographic_source_id: RETIRED_SOURCE } }, error: null });
    const fields = { id: CITY_ID, expected_updated_at: VERSION, description: "Unit-only introduction update" };
    await expect(saveCityAction({}, cityForm(fields))).rejects.toBe(mocks.redirectSignal);
    expect(session.client.rpc).toHaveBeenCalledWith("save_city", expect.objectContaining({ p_data: expect.objectContaining({ metadata: { geographic_source_id: RETIRED_SOURCE } }) }));
    session.client.rpc.mockClear();
    expect((await saveCityAction({}, cityForm({ ...fields, state: "Different unit state" }))).fieldErrors?.catalog_id).toBeDefined();
    expect(session.client.rpc).not.toHaveBeenCalled();
  });

  it("includes the reserved scalar in the UTF-8 byte budget and still requires flat metadata", async () => {
    const attributes = Object.fromEntries(Array.from({ length: 6 }, (_, index) => [`key${index}`, "x".repeat(484)]));
    expect(Buffer.byteLength(JSON.stringify(attributes))).toBeLessThan(3000);
    const nearLimit = await saveCityAction({}, cityForm({ catalog_id: CHAPRA, state: "Bihar", metadata: JSON.stringify(attributes) }));
    expect(nearLimit.fieldErrors?.metadata).toBeDefined();
    const nested = await saveCityAction({}, cityForm({ metadata: '{"nested":{"value":1}}', name: "" }));
    expect(nested.fieldErrors?.name).toBeDefined(); expect(nested.fieldErrors?.metadata).toBeDefined();
    expect(session.client.rpc).not.toHaveBeenCalled();
  });

  it("fails closed on unavailable/missing saved rows and preserves RPC conflicts", async () => {
    session.savedCity.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: PRIVATE } }).mockResolvedValueOnce({ data: null, error: null });
    for (let index = 0; index < 2; index++) {
      const response = await saveCityAction({}, cityForm({ id: CITY_ID, expected_updated_at: VERSION }));
      expect(response.error).toBeDefined(); expect(JSON.stringify(response)).not.toContain(PRIVATE);
    }
    expect(session.client.rpc).not.toHaveBeenCalled();
    session.saveResponse.error = { code: "P0001", message: "conflict" };
    expect((await saveCityAction({}, cityForm({ id: CITY_ID, expected_updated_at: VERSION }))).error).toMatch(/reload/i);
    expect(mocks.revalidateTag).not.toHaveBeenCalled(); expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("authenticates before catalog validation or saved-record reads and rechecks revoked membership", async () => {
    session.client.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    expect((await saveCityAction({}, cityForm({ catalog_id: "invalid" }))).error).toMatch(/sign in again/i);
    expect(session.client.from).not.toHaveBeenCalled();
    await expect(saveCityAction({}, cityForm())).rejects.toBe(mocks.redirectSignal);
    session.allowlist.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await saveCityAction({}, cityForm())).error).toMatch(/sign in again/i);
    expect(session.client.rpc).toHaveBeenCalledTimes(1);
  });
});

describe("real-session, full-query saved city previews", () => {
  it("reauthorizes before even an invalid slug and refuses an anonymous request", async () => {
    session.client.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(getAdminCityPreview("invalid/slug", parseSearchParams({}))).rejects.toBe(mocks.redirectSignal);
    expect(session.client.from).not.toHaveBeenCalled(); expect(session.client.rpc).not.toHaveBeenCalled();
  });

  it("requires current active allowlist membership rather than relying on a layout", async () => {
    await getAdminCityPreview(CITY.slug, parseSearchParams({}));
    session.allowlist.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(getAdminCityPreview(CITY.slug, parseSearchParams({}))).rejects.toBe(mocks.redirectSignal);
    expect(session.allowlist.eq).toHaveBeenCalledWith("id", ADMIN_ID);
    expect(session.allowlist.eq).toHaveBeenCalledWith("is_active", true);
    expect(session.client.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.anonymousClient).not.toHaveBeenCalled();
  });

  it("returns missing cities before fetching any preview inventory", async () => {
    session.savedCity.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await getAdminCityPreview(CITY.slug, parseSearchParams({}))).toBeNull();
    expect(session.client.rpc).not.toHaveBeenCalled(); expect(session.inventory.select).not.toHaveBeenCalled();
  });

  it("sends every filter to dedicated session RPCs with a 12-item page and full city facets", async () => {
    const filters = parseSearchParams({ q: "Unit", capacity: "200", budget: "2000", priceType: "per_event", facility: ["parking", "ac"], type: "banquet_hall", sort: "price", page: "3" });
    session.searchResponse.data = { ...RESULT, page: 3 };
    const data = await getAdminCityPreview(CITY.slug, filters);
    expect(session.client.rpc.mock.calls).toEqual([
      ["preview_city_venues", { p_city: CITY_ID, p_query: "Unit", p_capacity: 200, p_budget: 2000, p_price_type: "per_event", p_facilities: ["parking", "ac"], p_type: "banquet_hall", p_sort: "price", p_page: 3, p_limit: 12 }],
      ["preview_city_facets", { p_city: CITY_ID }],
    ]);
    expect(data?.facets).toEqual(FACETS); expect(data?.result.total).toBe(38); expect(data?.result.page).toBe(3);
    expect(data?.hasInventory).toBe(true); expect(data?.city.status).toBe("draft");
    expect(session.inventory.select).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(session.inventory.eq).toHaveBeenCalledWith("city_id", CITY_ID);
    expect(session.inventory.in).toHaveBeenCalledWith("status", ["draft", "published"]);
    expect(session.cover.limit).toHaveBeenCalledWith(1);
    expect(session.cover.eq).toHaveBeenCalledWith("city_id", CITY_ID);
    expect(mocks.anonymousClient).not.toHaveBeenCalled();
  });

  it("bounds query/page/capacity and refuses an incoherent budget or price sort", async () => {
    const requested = { ...parseSearchParams({}), q: "x".repeat(300), page: 2000, capacity: 200000, budget: 1000, sort: "price" as const };
    session.searchResponse.data = { ...RESULT, page: 1000 };
    await getAdminCityPreview(CITY.slug, requested);
    expect(session.client.rpc).toHaveBeenCalledWith("preview_city_venues", expect.objectContaining({ p_query: "x".repeat(100), p_page: 1000, p_capacity: 100000, p_budget: null, p_price_type: null, p_sort: "recent", p_limit: 12 }));
  });

  it("distinguishes a filtered-out result from empty inventory without fetching another inventory page", async () => {
    session.searchResponse.data = { items: [], total: 0, page: 1, pageSize: 12 };
    expect((await getAdminCityPreview(CITY.slug, parseSearchParams({ q: "not-present" })))?.hasInventory).toBe(true);
    expect(session.client.rpc).toHaveBeenCalledTimes(2);
    session.countResponse.count = 0;
    expect((await getAdminCityPreview(CITY.slug, parseSearchParams({})))?.hasInventory).toBe(false);
  });

  it("strips private research and unknown fields at nested JSON boundaries", async () => {
    session.searchResponse.data = { ...RESULT, source_notes: PRIVATE, items: [{ ...VENUE, research: { source_notes: PRIVATE }, source_notes: PRIVATE,
      city: { ...CITY, research: PRIVATE }, photos: [{ ...PHOTO, source_notes: PRIVATE }],
    }] };
    const data = await getAdminCityPreview(CITY.slug, parseSearchParams({}));
    expect(data?.result.items[0].name).toBe(VENUE.name); expect(JSON.stringify(data)).not.toContain(PRIVATE);
  });

  it.each(["archived", "unpublished", "other-city", "other-photo-owner", "wrong-page", "wrong-page-size", "oversized-page", "invalid-facet", "other-city-cover", "missing-count"])("fails closed on %s output without truncating/filtering it locally", async (kind) => {
    if (kind === "archived" || kind === "unpublished") session.searchResponse.data = { ...RESULT, items: [{ ...VENUE, status: kind }] };
    if (kind === "other-city") session.searchResponse.data = { ...RESULT, items: [{ ...VENUE, city_id: OTHER_ID }] };
    if (kind === "other-photo-owner") session.searchResponse.data = { ...RESULT, items: [{ ...VENUE, photos: [{ ...PHOTO, venue_id: OTHER_ID }] }] };
    if (kind === "wrong-page") session.searchResponse.data = { ...RESULT, page: 2 };
    if (kind === "wrong-page-size") session.searchResponse.data = { ...RESULT, pageSize: 25 };
    if (kind === "oversized-page") session.searchResponse.data = { ...RESULT, items: Array.from({ length: 13 }, () => VENUE) };
    if (kind === "invalid-facet") session.facetsResponse.data = { ...FACETS, facilities: ["invented-facility"] };
    if (kind === "other-city-cover") session.cover.maybeSingle.mockResolvedValue({ data: { ...COVER, city_id: OTHER_ID }, error: null });
    if (kind === "missing-count") session.countResponse.count = null;
    await expect(getAdminCityPreview(CITY.slug, parseSearchParams({}))).rejects.toBeInstanceOf(DataUnavailableError);
  });

  it.each(["search", "facets"])("does not substitute public or partial results when the %s RPC is unavailable", async (kind) => {
    const response = kind === "search" ? session.searchResponse : session.facetsResponse;
    response.error = { code: "PGRST202", message: PRIVATE };
    await expect(getAdminCityPreview(CITY.slug, parseSearchParams({}))).rejects.toThrow("The directory is temporarily unavailable.");
    expect(session.client.rpc.mock.calls.map(([name]) => name)).toEqual(["preview_city_venues", "preview_city_facets"]);
    expect(mocks.anonymousClient).not.toHaveBeenCalled();
  });
});

describe("shared public/preview rendering and catalog UI contracts", () => {
  it("keeps protected search/filter/pagination links and all images private, with saved status labels", async () => {
    const element = await CityPreviewPage({ params: Promise.resolve({ city: CITY.slug }), searchParams: Promise.resolve({ facility: "parking", priceType: "per_event" }) });
    const html = renderToStaticMarkup(element);
    expect(html).toContain("Preview: saved draft and published venues"); expect(html).toContain("Saved status: Draft");
    expect(html).toContain('action="/admin/cities/unit-city/preview"');
    expect(html).toContain(`/admin/venues/${VENUE_ID}/preview`);
    expect(html).toContain(`/api/admin/media/${PHOTO_ID}?w=`); expect(html).toContain(`/api/admin/media/${COVER_ID}?w=`);
    expect(html).not.toContain(`src="/media/`); expect(html).not.toContain('href="/city/');
    expect(html).not.toContain("application/ld+json"); expect(html).not.toContain(PRIVATE);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain("Guest count"); expect(html).toContain("Price basis"); expect(html).toContain("Recorded facilities"); expect(html).toContain("Venue type");
    expect(html).toContain("Apply sort"); expect(html).toContain("Results pages");
    expect(html).toContain("Recently updated"); expect(html).not.toContain("Recently published");
    expect({ dynamic, revalidate, fetchCache }).toEqual({ dynamic: "force-dynamic", revalidate: 0, fetchCache: "force-no-store" });
    expect(metadata).toMatchObject({ robots: { index: false, follow: false, nocache: true }, alternates: { canonical: null } });
  });

  it("renders public card URLs and public cover derivatives from the exact same city component", () => {
    const city = { ...CITY, status: "active" as const };
    const result = { ...RESULT, items: [{ ...VENUE, status: "published" as const, city }] };
    const html = renderToStaticMarkup(createElement(CityDiscovery, { city, result, filters: parseSearchParams({}), facets: FACETS, hasInventory: true, cover: COVER }));
    expect(html).toContain('action="/city/unit-city"'); expect(html).toContain('/city/unit-city/vivah-bhawan/unit-venue');
    expect(html).toContain(`/media/${PHOTO_ID}/`); expect(html).toContain(`/media/${COVER_ID}/`);
    expect(html).not.toContain("/api/admin/media/"); expect(html).not.toContain("Saved status:");
  });

  it("keeps public existence/metadata reads anonymous and stops at a missing city", async () => {
    const missing = query({ data: null, error: null });
    const rpc = vi.fn();
    const from = vi.fn().mockReturnValue(missing);
    mocks.anonymousClient.mockReturnValue({ from, rpc });
    const props = { params: Promise.resolve({ city: CITY.slug }), searchParams: Promise.resolve({}) };
    await expect(generateMetadata(props)).rejects.toBe(mocks.missingSignal);
    await expect(PublicCityPage(props)).rejects.toBe(mocks.missingSignal);
    expect(missing.eq).toHaveBeenCalledWith("status", "active");
    expect(missing.eq).toHaveBeenCalledWith("slug", CITY.slug);
    expect(rpc).not.toHaveBeenCalled(); expect(session.client.auth.getUser).not.toHaveBeenCalled();
    expect(from.mock.calls.every(([table]) => table === "cities")).toBe(true);
  });

  it("uses published-only public RPCs and a bounded anonymous cover lookup, not preview RPCs", async () => {
    const city = { ...CITY, status: "active" as const };
    const saved = query({ data: city, error: null }); const cover = query({ data: COVER, error: null });
    const result = { ...RESULT, items: [{ ...VENUE, status: "published" as const, city }] };
    const rpc = vi.fn(async (name: string) => {
      if (name === "search_venues") return { data: result, error: null };
      if (name === "city_facets") return { data: FACETS, error: null };
      throw new Error("Public pages may only use public RPCs.");
    });
    mocks.anonymousClient.mockReturnValue({ rpc, from: vi.fn((table: string) => table === "cities" ? saved : cover) });
    const html = renderToStaticMarkup(await PublicCityPage({ params: Promise.resolve({ city: CITY.slug }), searchParams: Promise.resolve({}) }));
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["search_venues", "city_facets"]);
    expect(saved.eq).toHaveBeenCalledWith("status", "active"); expect(cover.eq).toHaveBeenCalledWith("city_id", CITY_ID); expect(cover.limit).toHaveBeenCalledWith(1);
    expect(html).toContain(`/media/${COVER_ID}/`); expect(html).toContain("application/ld+json");
    expect(session.client.rpc).not.toHaveBeenCalled(); expect(mocks.sessionClient).not.toHaveBeenCalled();
  });

  it("keeps a launched city's hidden slug and metadata source out of the editable JSON", () => {
    const city: CitySummary = { ...linkedCity(), launched_at: VERSION, status: "active", published_count: 1, draft_count: 0, review_count: 0, total_count: 1, cover: COVER };
    const html = renderToStaticMarkup(createElement(CityForm, { city, catalogCity: getCatalogCity(HAZARIBAGH) }));
    expect(html).toContain(`name="catalog_id" value="${HAZARIBAGH}"`);
    expect(html).toContain('type="hidden" name="slug" value="hazaribag"');
    expect(html).toContain('name="expected_updated_at" value="2026-09-08T09:10:11.123456+05:30"');
    expect(html).toContain("Saved geographic source"); expect(html).toContain("Saved preview");
    const text = html.match(/<textarea[^>]*id="city-metadata"[^>]*>([\s\S]*?)<\/textarea>/)?.[1];
    expect(text).toBeDefined(); expect(text).not.toContain("geographic_source_id"); expect(text).toContain("public_label");
  });

  it("offers explicit manual entry and a labeled collapsed combobox rather than embedding the catalog JSON", () => {
    const html = renderToStaticMarkup(createElement(CityPicker, { value: null, onChange: vi.fn() }));
    expect(html).toContain('id="city-catalog-state"'); expect(html).toContain('role="combobox"'); expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="city-catalog-query-results"'); expect(html).toContain('role="listbox"');
    expect(html).toContain("GeoNames"); expect(html).toContain("CC BY 4.0"); expect(html).not.toContain(CHAPRA);
    const simple = renderToStaticMarkup(createElement(CityPicker, { value: null, onChange: vi.fn(), simple: true }));
    expect(simple).toContain('placeholder="Search cities in India"');
    expect(simple).toContain('role="combobox"');
    expect(simple).not.toContain('id="city-catalog-state"');
    expect(simple).not.toContain("manual entry");
    expect(simple).not.toContain("Arrow keys");
    expect(simple).toContain("GeoNames"); expect(simple).toContain("CC BY 4.0");
    const form = renderToStaticMarkup(createElement(CityForm));
    expect(form).toContain("Choose from catalog"); expect(form).toContain("Enter a city manually");
    expect(form).toContain("Select a catalog result before saving");
    const picker = readFileSync(new URL("../../src/components/admin/city-picker.tsx", import.meta.url), "utf8");
    expect(picker).not.toMatch(/indian-cities\.json|from ["']@\/lib\/city-catalog["']/);
    expect(picker).toContain("catalog?.states.map"); expect(picker).toContain("const RESULT_LIMIT = 12"); expect(picker).toContain("const SEARCH_DELAY = 300");
    expect(picker).toContain("JSON.stringify([searchQuery, stateCode, searchRevision])");
    for (const token of ["controller.abort()", "clearTimeout(timer)", "controller.signal.aborted", '"pointerdown"', '"ArrowDown"', '"ArrowUp"', '"Enter"', '"Escape"', "isComposing", 'cache: "no-store"']) expect(picker).toContain(token);
    const view = readFileSync(new URL("../../src/components/public/city-discovery.tsx", import.meta.url), "utf8");
    expect(view).not.toMatch(/EventImpression|JsonLd|@\/lib\/data\/|@\/lib\/auth/);
  });
});