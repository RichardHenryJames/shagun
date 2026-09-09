import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configReadiness, fixtureMode, indexingEnabled, isConfigured, siteUrl, type ConfigEnvironment } from "@/lib/config";
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

describe("pure configuration readiness (no clients or service calls)", () => {
  // Deliberately opaque synthetic keys: configuration is not key authentication.
  const publicApi = {
    NEXT_PUBLIC_SUPABASE_URL: "https://database.example.test",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "unit-test-only-publishable-key",
  };
  const ready: ConfigEnvironment = {
    ...publicApi, NEXT_PUBLIC_SITE_URL: "https://shagun.example.test", VERCEL: "1",
    SUPABASE_SERVICE_ROLE_KEY: "unit-test-only-server-key", RATE_LIMIT_SECRET: "s".repeat(32),
  };
  function legacyKey(role: string): string {
    const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role, synthetic: "??????>>>>>>" })}.unit-test-only-signature`;
  }

  beforeEach(() => {
    for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY",
      "RATE_LIMIT_SECRET", "NEXT_PUBLIC_SITE_URL", "VERCEL", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_ENV", "SHAGUN_TEST_FIXTURES"]) {
      vi.stubEnv(name, "");
    }
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("keeps ordinary unconfigured local production builds in the preparation state", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(configReadiness({})).toEqual({
      publicConfigured: false, adminReady: false,
      issues: ["supabase-url", "publishable-key", "server-key", "rate-limit-secret"],
    });
    expect(siteUrl()).toBe("http://localhost:3000");
    expect(isConfigured()).toBe(false);
    expect(indexingEnabled()).toBe(false);
    expect(fixtureMode()).toBe(false);
  });

  it("requires both nonempty public API values, including in partially configured deployments", () => {
    for (const field of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] as const) {
      for (const value of [undefined, "", " \t "]) {
        const environment = { ...ready, [field]: value };
        const result = configReadiness(environment);
        expect(result).toEqual({ publicConfigured: false, adminReady: false,
          issues: [field === "NEXT_PUBLIC_SUPABASE_URL" ? "supabase-url" : "publishable-key"] });
        vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", environment.NEXT_PUBLIC_SUPABASE_URL);
        vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
        expect(isConfigured()).toBe(false);
      }
    }
  });

  it("rejects malformed, credential-bearing and insecure remote Supabase URLs", () => {
    for (const url of [
      "not a URL", "//database.example.test", "ftp://database.example.test", "https://",
      "http://database.example.test", "http://localhost.example.test:54321", "http://192.168.1.10:54321", "http://[::]:54321",
      "https://unit-user:unit-password@database.example.test", "https://database.example.test:99999",
      "https://database.example.test/rest/v1", "https://database.example.test?key=unit-only", "https://database.example.test/#fragment",
    ]) {
      expect(configReadiness({ ...ready, NEXT_PUBLIC_SUPABASE_URL: url })).toEqual({
        publicConfigured: false, adminReady: false, issues: ["supabase-url"],
      });
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", publicApi.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
      expect(isConfigured()).toBe(false);
    }
  });

  it("supports remote HTTPS and local Supabase HTTP loopback without authenticating example keys", () => {
    for (const url of ["https://database.example.test", "https://DATABASE.example.test:443/",
      "http://localhost:54321", "http://127.0.0.1:54321", "http://127.0.0.2:54321", "http://[::1]:54321"]) {
      expect(configReadiness({ ...ready, NEXT_PUBLIC_SUPABASE_URL: url })).toEqual({ publicConfigured: true, adminReady: true, issues: [] });
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", publicApi.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
      expect(isConfigured()).toBe(true);
    }
  });

  it("rejects secret keys and privileged legacy JWT roles in public configuration", () => {
    const serviceJwt = legacyKey("service_role");
    // Exercise base64url decoding in the payload, not the synthetic signature.
    expect(serviceJwt.split(".")[1]).toContain("_");
    expect(serviceJwt.split(".")[1]).toContain("-");
    for (const key of ["sb_secret_unit-test-only", "  sb_secret_unit-test-only  ", serviceJwt, legacyKey("authenticated")]) {
      const result = configReadiness({ ...ready, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key });
      expect(result).toEqual({ publicConfigured: false, adminReady: false, issues: ["publishable-key"] });
      expect(JSON.stringify(result)).not.toContain(key);
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", publicApi.NEXT_PUBLIC_SUPABASE_URL);
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", key);
      expect(isConfigured()).toBe(false);
    }
  });

  it("accepts public publishable/anonymous keys and their corresponding server key types", () => {
    for (const [publicKey, serverKey] of [
      ["sb_publishable_unit-test-only", "sb_secret_unit-test-only"],
      [legacyKey("anon"), legacyKey("service_role")],
      [publicApi.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, ready.SUPABASE_SERVICE_ROLE_KEY],
    ]) {
      expect(configReadiness({ ...ready, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicKey, SUPABASE_SERVICE_ROLE_KEY: serverKey }))
        .toEqual({ publicConfigured: true, adminReady: true, issues: [] });
    }
  });

  it("withholds admin readiness for missing server credentials or a known public key in the server slot", () => {
    for (const key of [undefined, "", " \t ", "sb_publishable_unit-test-only", legacyKey("anon"), legacyKey("authenticated")]) {
      expect(configReadiness({ ...ready, SUPABASE_SERVICE_ROLE_KEY: key }))
        .toEqual({ publicConfigured: true, adminReady: false, issues: ["server-key"] });
    }
  });

  it("requires a private limiter secret of at least 32 characters without changing public readiness", () => {
    for (const secret of [undefined, "", "s".repeat(31)]) {
      expect(configReadiness({ ...ready, RATE_LIMIT_SECRET: secret }))
        .toEqual({ publicConfigured: true, adminReady: false, issues: ["rate-limit-secret"] });
    }
    expect(configReadiness(ready)).toEqual({ publicConfigured: true, adminReady: true, issues: [] });
    for (const [name, value] of Object.entries(publicApi)) vi.stubEnv(name, value);
    expect(isConfigured()).toBe(true);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", ready.NEXT_PUBLIC_SITE_URL);
    expect(indexingEnabled()).toBe(true);
    expect(configReadiness(publicApi)).toEqual({ publicConfigured: true, adminReady: false, issues: ["server-key", "rate-limit-secret"] });
  });

  it("requires a valid HTTPS origin on Vercel rather than silently treating a deployment as local", () => {
    for (const origin of [undefined, "", "http://localhost:3000", "http://shagun.example.test", "not-an-origin"]) {
      expect(configReadiness({ ...ready, NEXT_PUBLIC_SITE_URL: origin }))
        .toEqual({ publicConfigured: true, adminReady: false, issues: ["site-origin"] });
    }
    expect(configReadiness({ ...ready, NEXT_PUBLIC_SITE_URL: "", VERCEL_PROJECT_PRODUCTION_URL: "SHAGUN.example.test" }))
      .toEqual({ publicConfigured: true, adminReady: true, issues: [] });
    expect(configReadiness({ ...ready, NEXT_PUBLIC_SITE_URL: "http://localhost:3000", VERCEL_PROJECT_PRODUCTION_URL: "shagun.example.test" }))
      .toEqual({ publicConfigured: true, adminReady: false, issues: ["site-origin"] });
  });

  it("supports secure local setup, but does not promise login for unsupported remote fingerprinting", () => {
    for (const origin of [undefined, "http://localhost:3000", "http://127.0.0.1:3100", "http://[::1]:3100"]) {
      expect(configReadiness({ ...ready, VERCEL: "", NEXT_PUBLIC_SITE_URL: origin }))
        .toEqual({ publicConfigured: true, adminReady: true, issues: [] });
    }
    for (const origin of ["https://shagun.example.test", "https://localhost:3000"]) {
      expect(configReadiness({ ...ready, VERCEL: "", NEXT_PUBLIC_SITE_URL: origin }))
        .toEqual({ publicConfigured: true, adminReady: false, issues: ["request-fingerprint"] });
    }
  });

  it("uses only supplied configuration, never mutates it, logs it or returns private values", () => {
    const fetch = vi.fn(() => { throw new Error("Readiness must not contact a service."); });
    vi.stubGlobal("fetch", fetch);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const privateValue = "synthetic-private-config-detail";
    const environment = Object.freeze({ ...ready,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: `sb_secret_${privateValue}`,
      NEXT_PUBLIC_SITE_URL: `https://unit-user:${privateValue}@shagun.example.test`,
    });
    expect(configReadiness(environment)).toEqual({ publicConfigured: false, adminReady: false, issues: ["publishable-key", "site-origin"] });
    const serialized = JSON.stringify(configReadiness(environment));
    expect(serialized).not.toContain(privateValue);
    expect(serialized).not.toContain(ready.SUPABASE_SERVICE_ROLE_KEY);
    expect(serialized).not.toContain(ready.RATE_LIMIT_SECRET);
    expect(fetch).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
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
    ["partially configured API URL", { NEXT_PUBLIC_SUPABASE_URL: "https://database.example.test" }],
    ["partially configured API key", { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "unit-test-only-publishable-key" }],
    ["invalid API configuration", { NEXT_PUBLIC_SUPABASE_URL: "not a URL", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_unit-test-only" }],
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
  it("retains and normalizes an explicit custom origin", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "  HTTPS://Venues.Example.Test:443/  ");
    expect(siteUrl()).toBe("https://venues.example.test");
  });
  it("does not use deployment hostnames during local QA", () => {
    vi.stubEnv("VERCEL", "");
    expect(siteUrl()).toBe("http://localhost:3000");
  });
  it.each(["", "https://shagun.example.test", "user:password@shagun.example.test", "shagun.example.test/path", "shagun.example.test?redirect=evil"])("fails closed for a missing or non-host provider value: %s", (value) => {
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", value);
    expect(siteUrl).toThrow("Configure a valid HTTPS site origin");
  });
  it("never falls back from an invalid explicit origin to a provider origin or insecure cookies", () => {
    for (const origin of [
      "not an origin", "//shagun.example.test", "ftp://shagun.example.test", "http://shagun.example.test", "http://localhost:3000",
      "https://unit-user:unit-private-password@shagun.example.test", "https://shagun.example.test:99999",
      "https://shagun.example.test/admin", "https://shagun.example.test//", "https://shagun.example.test?", "https://shagun.example.test/#",
      "https://shagun.example.test\\admin",
    ]) {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", origin);
      expect(siteUrl).toThrow("Configure a valid HTTPS site origin");
      try { siteUrl(); }
      catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).not.toContain(origin);
        expect((error as Error).message).not.toContain("unit-private-password");
      }
    }
  });
  it("allows local HTTP only on loopback outside Vercel", () => {
    vi.stubEnv("VERCEL", "");
    for (const origin of ["http://localhost:3100", "http://127.0.0.1:3100", "http://127.0.0.2:3100", "http://[::1]:3100"]) {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", `${origin}/`);
      expect(siteUrl()).toBe(origin);
    }
    for (const origin of ["http://shagun.example.test", "http://localhost.example.test:3100", "http://192.168.1.10:3100", "http://[::]:3100"]) {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", origin);
      expect(siteUrl).toThrow("Configure a valid HTTPS site origin");
    }
  });
});