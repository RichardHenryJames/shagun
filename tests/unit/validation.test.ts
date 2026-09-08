import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureMode, indexingEnabled, isConfigured, siteUrl } from "@/lib/config";
import type { SearchFilters } from "@/lib/types";
import { filterParams, hasActiveFilters, parseSearchParams, photoMetadataSchema, slugSchema, uuidSchema } from "@/lib/validation";

const PHOTO_ID = "50000000-0000-4000-8000-000000000005";
const EMPTY_FILTERS: SearchFilters = {
  q: "", page: 1, sort: "recent", capacity: null, budget: null,
  priceType: null, type: null, facilities: [],
};

// Mutation payloads/review/version fields are already covered by actions.test.ts.
describe("photo metadata and public identifiers", () => {
  it("trims both required photo fields and accepts their exact 5/250/300-character boundaries", () => {
    expect(photoMetadataSchema.parse({ alt_text: "  Synthetic rectangle  ", credit: "  Generated for unit tests  " })).toEqual({
      alt_text: "Synthetic rectangle", credit: "Generated for unit tests",
    });
    for (const metadata of [
      { alt_text: "abcde", credit: "abcde" },
      { alt_text: "a".repeat(250), credit: "c".repeat(300) },
    ]) expect(photoMetadataSchema.parse(metadata)).toEqual(metadata);
  });

  it("rejects blank, missing, short and over-limit alternative text or rights credit after trimming", () => {
    for (const [field, max] of [["alt_text", 250], ["credit", 300]] as const) {
      for (const value of ["", "abcd", "  abcd  ", "x".repeat(max + 1), null, undefined]) {
        const result = photoMetadataSchema.safeParse({ alt_text: "Synthetic rectangle", credit: "Generated for unit tests", [field]: value });
        expect(result.success, `${field}: ${String(value)}`).toBe(false);
        if (!result.success) expect(result.error.issues.some((issue) => issue.path[0] === field)).toBe(true);
      }
    }
  });

  it("validates UUIDs and lowercase single-hyphen slugs without accepting path fragments", () => {
    expect(uuidSchema.parse(PHOTO_ID)).toBe(PHOTO_ID);
    for (const id of ["", "not-a-uuid", `../${PHOTO_ID}`, `${PHOTO_ID}/960.webp`]) expect(uuidSchema.safeParse(id).success).toBe(false);
    for (const slug of ["ab", "synthetic-city-2", "a".repeat(90)]) expect(slugSchema.parse(slug)).toBe(slug);
    for (const slug of ["a", "a".repeat(91), "Uppercase", "two--hyphens", "-leading", "trailing-", "two_words", "../city"]) {
      expect(slugSchema.safeParse(slug).success, slug).toBe(false);
    }
  });
});

describe("bounded search filters and URL serialization", () => {
  it("defaults empty input and does not treat pagination as an active filter", () => {
    expect(parseSearchParams({})).toEqual(EMPTY_FILTERS);
    expect(filterParams(EMPTY_FILTERS).toString()).toBe("");
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasActiveFilters(parseSearchParams({ page: "2" }))).toBe(false);
  });

  it("uses the first scalar value, removes control characters, clamps numbers and deduplicates facilities", () => {
    expect(parseSearchParams({
      q: ["  syn\u0000\u001fthetic query  ", "ignored"], page: ["2000", "3"],
      capacity: "100001", budget: "100000001", priceType: "per_event", sort: "price", type: "vivah_bhawan",
      facility: ["ac", "parking", "ac", "invented-facility"],
    })).toEqual({
      q: "synthetic query", page: 1000, sort: "price", capacity: 100000, budget: 100000000,
      priceType: "per_event", type: "vivah_bhawan", facilities: ["ac", "parking"],
    });
    expect(parseSearchParams({ q: "x".repeat(101) }).q).toBe("x".repeat(100));
  });

  it("rejects zero, negative, decimal, scientific and non-numeric filter values", () => {
    for (const value of ["0", "-1", "1.5", "1e3", "NaN", "Infinity", " 2 "]) {
      expect(parseSearchParams({ page: value, capacity: value, budget: value, priceType: "per_day" })).toMatchObject({
        page: 1, capacity: null, budget: null, priceType: "per_day",
      });
    }
  });

  it("requires a supported price basis before applying a budget or price sorting", () => {
    for (const priceType of [undefined, "", "per_person"]) {
      expect(parseSearchParams({ priceType, budget: "500", sort: "price" })).toMatchObject({ priceType: null, budget: null, sort: "recent" });
    }
    for (const priceType of ["per_day", "per_event", "per_plate"]) {
      expect(parseSearchParams({ priceType, budget: "500", sort: "price" })).toMatchObject({ priceType, budget: 500, sort: "price" });
    }
  });

  it("drops unsupported enums and facilities, while handling comma-separated facilities", () => {
    expect(parseSearchParams({ type: "marriage_hall", sort: "rating", facility: "parking,ac,parking,unknown,AC" })).toEqual({
      ...EMPTY_FILTERS, facilities: ["parking", "ac"],
    });
    expect(parseSearchParams({ type: ["hotel", "resort"], sort: ["name", "price"], facility: [] })).toMatchObject({ type: "hotel", sort: "name", facilities: [] });
  });

  it("round-trips filters and repeated facilities, applies overrides without mutation and omits uncomparable budgets", () => {
    const filters = parseSearchParams({ q: "synthetic & quiet", page: "2", sort: "price", capacity: "100", budget: "500", priceType: "per_plate", type: "hotel", facility: ["parking", "ac"] });
    const params = filterParams(filters, { page: 3 });
    expect(params.get("q")).toBe("synthetic & quiet");
    expect(params.getAll("facility")).toEqual(["parking", "ac"]);
    expect(parseSearchParams({ ...Object.fromEntries(params), facility: params.getAll("facility") })).toEqual({ ...filters, page: 3 });
    expect(filters.page).toBe(2);
    expect(filterParams(filters, { page: 1 }).has("page")).toBe(false);
    expect(filterParams(filters, { priceType: null }).has("budget")).toBe(false);
  });

  it("recognizes each supported non-pagination filter as active", () => {
    const changes: Array<Partial<SearchFilters>> = [
      { q: "synthetic" }, { capacity: 100 }, { budget: 500 }, { priceType: "per_event" },
      { type: "banquet_hall" }, { facilities: ["parking"] }, { sort: "name" },
    ];
    for (const change of changes) expect(hasActiveFilters({ ...EMPTY_FILTERS, ...change })).toBe(true);
  });
});

describe("fixture configuration guard (without importing any fixture data)", () => {
  beforeEach(() => {
    for (const [name, value] of Object.entries({
      SHAGUN_TEST_FIXTURES: "true", NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "", VERCEL: "",
    })) vi.stubEnv(name, value);
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("permits explicit local HTTP fixtures only without a configured database", () => {
    expect(isConfigured()).toBe(false);
    for (const origin of ["http://localhost", "http://localhost:3000/", "http://127.0.0.1:5173"]) {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", origin);
      expect(fixtureMode()).toBe(true);
    }
  });

  const forbiddenEnvironments: Array<[string, Record<string, string>]> = [
    ["deployed server", { VERCEL: "1" }],
    ["connected database", { NEXT_PUBLIC_SUPABASE_URL: "https://database.example.test", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "unit-test-only-publishable-key" }],
    ["deceptive localhost hostname", { NEXT_PUBLIC_SITE_URL: "http://localhost.example.test:3000" }],
    ["HTTPS origin", { NEXT_PUBLIC_SITE_URL: "https://localhost:3000" }],
  ];
  it.each(forbiddenEnvironments)("refuses fixtures on a %s before any fixture module can be loaded", (_label, environment) => {
    for (const [name, value] of Object.entries(environment)) vi.stubEnv(name, value);
    expect(() => fixtureMode()).toThrow("Test fixtures are only allowed locally, without a connected database.");
  });

  it("never enables fixtures through truthy-but-not-true flags, even in a connected deployment", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://database.example.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "unit-test-only-publishable-key");
    expect(isConfigured()).toBe(true);
    for (const value of ["", "false", "TRUE", "1"]) {
      vi.stubEnv("SHAGUN_TEST_FIXTURES", value);
      expect(fixtureMode()).toBe(false);
    }
  });
});

describe("deployment canonical origin", () => {
  beforeEach(() => {
    for (const [key, value] of Object.entries({ NEXT_PUBLIC_SITE_URL: "", VERCEL: "1",
      VERCEL_PROJECT_PRODUCTION_URL: "shagun.example.test", NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "", SHAGUN_TEST_FIXTURES: "false" })) vi.stubEnv(key, value);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("uses the provider's production origin without enabling indexing for an unconfigured app", () => {
    expect(siteUrl()).toBe("https://shagun.example.test");
    expect(indexingEnabled()).toBe(false);
  });
  it("retains an explicit custom origin", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://venues.example.test/");
    expect(siteUrl()).toBe("https://venues.example.test");
  });
  it("does not use deployment hostnames during local QA", () => {
    vi.stubEnv("VERCEL", "");
    expect(siteUrl()).toBe("http://localhost:3000");
  });
  it.each(["https://shagun.example.test", "user:password@shagun.example.test", "shagun.example.test/path", "shagun.example.test?redirect=evil"])("rejects non-host provider values: %s", (value) => {
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", value);
    expect(siteUrl()).toBe("http://localhost:3000");
  });
});