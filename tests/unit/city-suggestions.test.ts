import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CITY_SUGGESTION_LIMIT, CITY_SUGGESTION_QUERY_LIMIT, parseCitySuggestions,
  validCitySuggestionQuery, type CitySuggestion,
} from "@/lib/city-suggestions";
import type { Database } from "@/lib/db/database.types";
import { ADMIN_COOKIE_NAME } from "@/lib/db/schema";

const mocks = vi.hoisted(() => ({
  anonymousClient: vi.fn<() => unknown>(),
  sessionClient: vi.fn<() => Promise<unknown>>(),
  serviceClient: vi.fn<() => unknown>(),
  fetch: vi.fn<typeof fetch>(),
}));
vi.mock("@/lib/db/clients", () => ({
  anonymousClient: mocks.anonymousClient, sessionClient: mocks.sessionClient, serviceClient: mocks.serviceClient,
}));

// Exercise the real GET -> repository -> parser, including real configuration
// and local fixture guards. Only external clients/fetch are replaced.
import { GET, dynamic, runtime } from "@/app/api/cities/suggestions/route";
import { getPublicCitySuggestions } from "@/lib/data/city-suggestions";
import { DataUnavailableError } from "@/lib/data/errors";

const PRIVATE_ERROR = "unit-only-private-city-provider-detail";
const ADMIN_COOKIE = `${ADMIN_COOKIE_NAME}=unit-only-admin-session`;
const PUBLIC_CITY: CitySuggestion = {
  name: "Synthetic Unit City", slug: "synthetic-unit-city", state: "Synthetic Unit State",
};
const INVALID_SLUGS: unknown[] = [
  null, 12, "", "a", "a".repeat(91), "Synthetic-City", "synthetic_city", "synthetic--city",
  "-synthetic", "synthetic-", "synthetic city", "नगर", "..", "../admin", "/admin",
  "//other.example.test", "https://other.example.test", "javascript:alert(1)",
  "synthetic\\admin", "synthetic?admin=true", "synthetic#private", "%2e%2e%2fadmin",
  'synthetic"><script>', "synthetic\u0000", "synthetic\n",
];
const INVALID_LABELS: unknown[] = [
  null, undefined, 12, true, [], {}, "", "x", "x".repeat(101), " Synthetic", "Synthetic ",
  "Synthetic\u0000", "Synthetic\tCity", "Synthetic\nCity", "Synthetic\u007f", "Synthetic\u0085",
];

function suggestion(change: Partial<CitySuggestion> = {}): CitySuggestion {
  return { ...PUBLIC_CITY, ...change };
}

// Deliberately synthetic rows and private sentinels, never real inventory.
function cityRow(change: Record<string, unknown> = {}) {
  return {
    ...suggestion(), status: "active", id: "10000000-0000-4000-8000-000000000099",
    country: "Synthetic Unit Country", description: PRIVATE_ERROR,
    notes: PRIVATE_ERROR, source_notes: PRIVATE_ERROR, reviewed_by: "unit-only-admin-id",
    metadata: { geographic_source_id: "geonames:900000099", editorial_notes: PRIVATE_ERROR },
    venue_research: { source_notes: PRIVATE_ERROR },
    seo_title: PRIVATE_ERROR, seo_description: PRIVATE_ERROR,
    photos: [{ id: "unit-only-photo-id", storage_key: PRIVATE_ERROR }],
    cover: { id: "unit-only-cover-id", storage_key: PRIVATE_ERROR, credit: PRIVATE_ERROR },
    published_count: 2, total_count: 7, draft_count: 5, review_count: 3,
    created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-02T00:00:00.000Z",
    ...change,
  };
}

type PublicCitiesArgs = Database["shagun"]["Functions"]["public_cities"]["Args"];
type RpcResult = { data: unknown; error: unknown };

function makeAnonymous() {
  const builder = {
    abortSignal: vi.fn<(signal: AbortSignal) => Promise<RpcResult>>()
      .mockResolvedValue({ data: { items: [cityRow()], total: 1 }, error: null }),
  };
  const forbiddenRead = () => { throw new Error("Suggestions must not read Auth, tables, counts or Storage separately."); };
  const client = {
    rpc: vi.fn<(name: string, args: PublicCitiesArgs) => typeof builder>().mockImplementation((name) => {
      if (name !== "public_cities") throw new Error("Only the bounded public_cities RPC is allowed.");
      return builder;
    }),
    from: vi.fn(forbiddenRead),
    auth: { getUser: vi.fn(forbiddenRead), getClaims: vi.fn(forbiddenRead), getSession: vi.fn(forbiddenRead) },
    storage: { from: vi.fn(forbiddenRead) },
  };
  return { client, builder };
}

let anonymous: ReturnType<typeof makeAnonymous>;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://unit-project.example.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "unit-test-only-publishable-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  vi.stubEnv("RATE_LIMIT_SECRET", "");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3100");
  vi.stubEnv("SHAGUN_TEST_FIXTURES", "false");
  vi.stubEnv("SHAGUN_FIXTURE_SCENARIO", "many");
  vi.stubEnv("VERCEL", undefined);
  vi.stubEnv("VERCEL_ENV", undefined);
  vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", undefined);
  anonymous = makeAnonymous();
  mocks.anonymousClient.mockReturnValue(anonymous.client);
  mocks.sessionClient.mockRejectedValue(new Error("Public suggestions must not construct a session client."));
  mocks.serviceClient.mockImplementation(() => { throw new Error("Public suggestions must not construct a service client."); });
  mocks.fetch.mockImplementation(() => { throw new Error("Real network access is forbidden in suggestions unit tests."); });
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => {
  try {
    expect(mocks.sessionClient).not.toHaveBeenCalled();
    expect(mocks.serviceClient).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(anonymous.client.from).not.toHaveBeenCalled();
    expect(anonymous.client.storage.from).not.toHaveBeenCalled();
    expect(anonymous.client.auth.getUser).not.toHaveBeenCalled();
    expect(anonymous.client.auth.getClaims).not.toHaveBeenCalled();
    expect(anonymous.client.auth.getSession).not.toHaveBeenCalled();
    for (const [name, args] of anonymous.client.rpc.mock.calls) {
      expect(name).toBe("public_cities");
      expect(args).toEqual({ p_query: expect.any(String), p_page: 1, p_limit: 8 });
    }
  } finally {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  }
});

function request(parameters = "", cookie?: string): Request {
  return new Request(`https://shagun.example.test/api/cities/suggestions${parameters}`, {
    headers: cookie === undefined ? {} : { cookie },
  });
}
function queryRequest(query: string, cookie?: string): Request {
  return request(`?${new URLSearchParams({ q: query })}`, cookie);
}
function expectNoPublicRead(): void {
  expect(mocks.anonymousClient).not.toHaveBeenCalled();
  expect(anonymous.client.rpc).not.toHaveBeenCalled();
  expect(anonymous.builder.abortSignal).not.toHaveBeenCalled();
}
function expectPublicHeaders(response: Response): void {
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("content-type")).toBe("application/json");
  expect(response.headers.get("set-cookie")).toBeNull();
  const vary = (response.headers.get("vary") ?? "").toLowerCase().split(",").map((value) => value.trim());
  expect(vary).not.toContain("cookie");
  expect(vary).not.toContain("*");
}
async function expectItems(response: Response, items: CitySuggestion[]): Promise<void> {
  expect(response.status).toBe(200);
  expectPublicHeaders(response);
  expect(response.headers.get("retry-after")).toBeNull();
  const body: unknown = await response.json();
  expect(body).toStrictEqual({ items });
  expect(parseCitySuggestions(body)).toStrictEqual(items);
  expect(JSON.stringify(body)).not.toContain(PRIVATE_ERROR);
}
async function expectPublicError(response: Response, status: 400 | 503): Promise<void> {
  expect(response.status).toBe(status);
  expectPublicHeaders(response);
  expect(response.headers.get("retry-after")).toBe(status === 503 ? "60" : null);
  const body: unknown = await response.json();
  expect(body).toStrictEqual({ error: status === 400
    ? "Use one city search of at most 100 characters without control characters."
    : "City suggestions are temporarily unavailable." });
  expect(body).not.toHaveProperty("items");
  expect(body).not.toHaveProperty("data");
  expect(JSON.stringify(body)).not.toContain(PRIVATE_ERROR);
}

describe("pure compact city suggestion contract", () => {
  afterEach(() => { expectNoPublicRead(); });

  it("fixes the compact limits and accepts empty, Unicode and exactly 100-character queries", () => {
    expect(CITY_SUGGESTION_LIMIT).toBe(8);
    expect(CITY_SUGGESTION_QUERY_LIMIT).toBe(100);
    for (const value of ["", "   ", "  Synthetic  ", "परीक्षण नगर", "École", "é".repeat(100)]) {
      expect(validCitySuggestionQuery(value), JSON.stringify(value)).toBe(true);
    }
  });

  it("rejects non-string, overlong and control-character queries without trimming them into validity", () => {
    for (const value of [
      undefined, null, 12, true, {}, [], ["Synthetic"], "x".repeat(101), ` ${"x".repeat(100)}`,
      "Synthetic\u0000", "Synthetic\t", "Synthetic\n", "Synthetic\r", "Synthetic\u007f", "Synthetic\u0085",
    ]) expect(validCitySuggestionQuery(value), JSON.stringify(value)).toBe(false);
  });

  it("accepts exactly an items envelope with zero through eight minimal city records", () => {
    for (const length of [0, 1, 8]) {
      const items = Array.from({ length }, (_, index) => suggestion({ slug: `synthetic-unit-${index}` }));
      expect(parseCitySuggestions({ items })).toStrictEqual(items);
    }
  });

  it("preserves Unicode labels and the inclusive label/slug length boundaries", () => {
    const items = [
      suggestion({ name: "परीक्षण नगर", state: "परीक्षण क्षेत्र", slug: "synthetic-unicode" }),
      suggestion({ name: "é".repeat(100), state: "界".repeat(100), slug: "a".repeat(90) }),
      suggestion({ name: "Ab", state: "Cd", slug: "ab" }),
      suggestion({ name: "Synthetic École", state: "Synthetic Test Region", slug: "synthetic-2-city" }),
    ];
    expect(parseCitySuggestions({ items })).toStrictEqual(items);
  });

  it("returns null for malformed envelopes and undeclared top-level fields, not partial data", () => {
    for (const value of [
      undefined, null, true, 12, "[]", [], {}, { items: null }, { items: {} }, { items: "[]" },
      { data: { items: [suggestion()] } }, { items: [], total: 0 },
      { items: [suggestion()], error: PRIVATE_ERROR }, { items: [suggestion()], metadata: PRIVATE_ERROR },
    ]) expect(parseCitySuggestions(value), JSON.stringify(value)).toBeNull();
  });

  it("requires all three city fields and rejects every extra field instead of silently stripping it", () => {
    for (const item of [
      null, undefined, true, 12, "Synthetic", [], {},
      { name: PUBLIC_CITY.name, slug: PUBLIC_CITY.slug },
      { name: PUBLIC_CITY.name, state: PUBLIC_CITY.state },
      { slug: PUBLIC_CITY.slug, state: PUBLIC_CITY.state },
      ...["id", "status", "metadata", "notes", "photos", "href", "published_count"].map((field) => ({
        ...suggestion(), [field]: PRIVATE_ERROR,
      })),
    ]) expect(parseCitySuggestions({ items: [item] }), JSON.stringify(item)).toBeNull();
  });

  it("rejects unsafe, malformed or oversized navigation slugs without coercion or repair", () => {
    for (const slug of INVALID_SLUGS) {
      expect(parseCitySuggestions({ items: [{ ...suggestion(), slug }] }), JSON.stringify(slug)).toBeNull();
    }
  });

  it("rejects invalid name and state labels, including controls and values over 100 characters", () => {
    for (const field of ["name", "state"]) {
      for (const value of INVALID_LABELS) {
        expect(parseCitySuggestions({ items: [{ ...suggestion(), [field]: value }] }), `${field}: ${JSON.stringify(value)}`).toBeNull();
      }
    }
  });

  it("rejects oversized lists, duplicate slugs and a malformed later row without returning an accepted prefix", () => {
    const oversized = Array.from({ length: 9 }, (_, index) => suggestion({ slug: `synthetic-unit-${index}` }));
    for (const items of [
      oversized,
      [suggestion(), suggestion({ name: "Synthetic Different Name", state: "Synthetic Different State" })],
      [suggestion(), { ...suggestion({ slug: "synthetic-second" }), state: PRIVATE_ERROR + "\u0000" }],
    ]) expect(parseCitySuggestions({ items })).toBeNull();
  });

  it("returns fresh arrays and city objects without modifying or retaining mutable input records", () => {
    const input = { items: [suggestion()] };
    const first = parseCitySuggestions(input);
    const second = parseCitySuggestions(input);
    expect(first).toStrictEqual([PUBLIC_CITY]);
    expect(second).toStrictEqual([PUBLIC_CITY]);
    if (first === null || second === null) throw new Error("Expected valid synthetic suggestions.");
    expect(first).not.toBe(input.items);
    expect(first).not.toBe(second);
    expect(first[0]).not.toBe(input.items[0]);
    expect(first[0]).not.toBe(second[0]);
    first[0].name = "Synthetic Caller Change";
    first.push(suggestion({ slug: "synthetic-added" }));
    expect(input).toStrictEqual({ items: [PUBLIC_CITY] });
    expect(second).toStrictEqual([PUBLIC_CITY]);
    input.items[0].state = "Synthetic Input Change";
    expect(second).toStrictEqual([PUBLIC_CITY]);
    expect(parseCitySuggestions(Object.freeze({ items: Object.freeze([Object.freeze(suggestion())]) })))
      .toStrictEqual([PUBLIC_CITY]);
  });

  it("requires declared own keys, not matching key counts with inherited items or city fields", () => {
    // These prototypes are local to the test; Object.prototype is never changed.
    const inheritedEnvelope = Object.assign(Object.create({ items: [suggestion()] }) as object, { metadata: PRIVATE_ERROR });
    const inheritedCity = Object.assign(Object.create(suggestion()) as object, {
      id: "unit-only-private-id", metadata: PRIVATE_ERROR, photos: [],
    });
    expect(parseCitySuggestions(inheritedEnvelope)).toBeNull();
    expect(parseCitySuggestions({ items: [inheritedCity] })).toBeNull();
  });
});

describe("public GET through the real city suggestion repository", () => {
  it("uses a stateless public_cities RPC with trimmed query, page one, limit eight and a real five-second signal", async () => {
    // Call-through observation only: the native timeout implementation still runs.
    const timeout = vi.spyOn(AbortSignal, "timeout");
    expect(runtime).toBe("nodejs");
    expect(dynamic).toBe("force-dynamic");
    await expectItems(await GET(queryRequest("  Synthetic  ")), [PUBLIC_CITY]);
    expect(mocks.anonymousClient).toHaveBeenCalledExactlyOnceWith();
    expect(anonymous.client.rpc).toHaveBeenCalledExactlyOnceWith("public_cities", {
      p_query: "Synthetic", p_page: 1, p_limit: 8,
    });
    expect(timeout).toHaveBeenCalledExactlyOnceWith(5_000);
    expect(anonymous.builder.abortSignal).toHaveBeenCalledExactlyOnceWith(expect.any(AbortSignal));
    const signal = anonymous.builder.abortSignal.mock.lastCall?.[0];
    expect(signal).toBe(timeout.mock.results[0]?.value);
    expect(signal?.aborted).toBe(false);
  });

  it("passes omitted, empty and whitespace-only q as an empty RPC query rather than bypassing inventory", async () => {
    for (const parameters of ["", "?q=", "?q=%20%20"]) {
      await expectItems(await GET(request(parameters)), [PUBLIC_CITY]);
    }
    expect(mocks.anonymousClient).toHaveBeenCalledTimes(3);
    expect(anonymous.client.rpc.mock.calls).toEqual(Array.from({ length: 3 }, () => [
      "public_cities", { p_query: "", p_page: 1, p_limit: 8 },
    ]));
  });

  it("passes Unicode, exactly 100 characters and SQL-looking searches only as opaque RPC arguments", async () => {
    anonymous.builder.abortSignal.mockResolvedValue({ data: { items: [], total: 0 }, error: null });
    const queries = ["परीक्षण नगर", "é".repeat(100), "' OR 1=1; --", "synthetic%_,(*)"];
    for (const query of queries) {
      await expectItems(await GET(queryRequest(query)), []);
      expect(anonymous.client.rpc).toHaveBeenLastCalledWith("public_cities", { p_query: query, p_page: 1, p_limit: 8 });
    }
    expect(anonymous.client.rpc).toHaveBeenCalledTimes(queries.length);
  });

  it.each(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"])(
    "returns honest unconfigured emptiness without %s, even for Haza, before constructing any client",
    async (variable) => {
      for (const value of [undefined, "", "   "]) {
        vi.stubEnv(variable, value);
        for (const parameters of ["", "?q=Haza"]) await expectItems(await GET(request(parameters, ADMIN_COOKIE)), []);
      }
      expectNoPublicRead();
    },
  );

  it("projects all eight rows to name/slug/state only, dropping private fields, IDs, photos and envelope counts", async () => {
    const items = Array.from({ length: 8 }, (_, index) => suggestion({
      name: `Synthetic Unit City ${index}`, slug: `synthetic-unit-${index}`,
    }));
    anonymous.builder.abortSignal.mockResolvedValue({
      data: { items: items.map((item) => cityRow(item)), total: 999, metadata: PRIVATE_ERROR, notes: PRIVATE_ERROR },
      error: null,
    });
    await expectItems(await GET(request()), items);
    expect(anonymous.client.rpc).toHaveBeenCalledOnce();
    expect(anonymous.builder.abortSignal).toHaveBeenCalledOnce();
  });

  it("keeps a genuine configured empty result empty without using GeoNames or the Hazaribag research batch", async () => {
    anonymous.builder.abortSignal.mockResolvedValue({ data: { items: [], total: 0 }, error: null });
    await expectItems(await GET(queryRequest("Haza")), []);
    expect(mocks.anonymousClient).toHaveBeenCalledOnce();
    expect(anonymous.client.rpc).toHaveBeenCalledExactlyOnceWith("public_cities", { p_query: "Haza", p_page: 1, p_limit: 8 });
  });

  it("returns identical public data and headers with no cookies, an admin cookie or chunked/sibling cookies", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "unit-test-only-service-key");
    const cookies = [undefined, ADMIN_COOKIE, `${ADMIN_COOKIE_NAME}.0=unit-only-chunk; sb-shared-project-auth-token=unit-only-sibling`];
    const responses: Response[] = [];
    for (const cookie of cookies) {
      const response = await GET(queryRequest("Synthetic", cookie));
      responses.push(response);
      await expectItems(response, [PUBLIC_CITY]);
    }
    for (const response of responses) expect([...response.headers]).toEqual([...responses[0].headers]);
    expect(mocks.anonymousClient).toHaveBeenCalledTimes(3);
    expect(anonymous.client.rpc).toHaveBeenCalledTimes(3);
  });

  it("rejects overlong raw queries before trimming or constructing a client", async () => {
    for (const query of ["x".repeat(101), ` ${"x".repeat(100)}`, PRIVATE_ERROR.repeat(4)]) {
      await expectPublicError(await GET(queryRequest(query)), 400);
      await expect(getPublicCitySuggestions(query)).rejects.toBeInstanceOf(DataUnavailableError);
    }
    expectNoPublicRead();
  });

  it("rejects URL-decoded C0, DEL and C1 controls before constructing a client", async () => {
    for (const control of ["\u0000", "\t", "\n", "\r", "\u001b", "\u007f", "\u0085"]) {
      const query = `${PRIVATE_ERROR}${control}`;
      await expectPublicError(await GET(queryRequest(query)), 400);
      await expect(getPublicCitySuggestions(query)).rejects.toBeInstanceOf(DataUnavailableError);
    }
    expectNoPublicRead();
  });

  it("rejects duplicate q parameters, including empty and encoded names, even with an admin cookie", async () => {
    for (const parameters of ["?q=one&q=two", "?q=&q=", "?q=one&%71=two", "?q=one&q=one"]) {
      await expectPublicError(await GET(request(parameters, ADMIN_COOKIE)), 400);
    }
    expectNoPublicRead();
  });

  it("rejects every non-q parameter instead of enabling paging, counts, state filters or arbitrary navigation", async () => {
    for (const parameters of [
      "?page=1", "?limit=8", "?state=IN.38", "?Q=Synthetic", "?q[]=Synthetic",
      "?q=Synthetic&include=count", "?q=Synthetic&status=draft", "?q=Synthetic&href=/admin",
      `?unknown=${PRIVATE_ERROR}`,
    ]) await expectPublicError(await GET(request(parameters)), 400);
    expectNoPublicRead();
  });

  it("validates queries before either the unconfigured empty path or forbidden fixture configuration", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    await expectPublicError(await GET(queryRequest("x".repeat(101))), 400);
    vi.stubEnv("SHAGUN_TEST_FIXTURES", "true");
    vi.stubEnv("VERCEL", "1");
    await expectPublicError(await GET(request("?q=one&q=two")), 400);
    expectNoPublicRead();
  });

  it("fails closed for inactive, draft, archived or malformed statuses without returning an active prefix", async () => {
    for (const status of ["inactive", "draft", "archived", "ACTIVE", "published", null, undefined, true]) {
      anonymous.builder.abortSignal.mockResolvedValue({
        data: { items: [cityRow(), cityRow({ slug: "synthetic-second", status })], total: 2 }, error: null,
      });
      await expectPublicError(await GET(request()), 503);
    }
  });

  it("sanitizes malformed RPC envelopes, item collections and incomplete active rows as unavailable", async () => {
    const payloads: unknown[] = [
      undefined, null, false, 12, "provider payload", [], {}, { items: null }, { items: "[]" }, { items: {} },
      { items: [null] }, { items: [[]] }, { items: [suggestion()] }, { items: [{ status: "active" }] },
      { items: [cityRow(), { status: "active", name: PRIVATE_ERROR }] },
    ];
    for (const data of payloads) {
      anonymous.builder.abortSignal.mockResolvedValue({ data, error: null });
      await expectPublicError(await GET(request()), 503);
    }
  });

  it("applies the real pure parser to active RPC rows, rejecting unsafe slugs and malformed labels", async () => {
    const changes = [
      ...INVALID_SLUGS.map((slug) => ({ slug })),
      ...INVALID_LABELS.flatMap((value) => [{ name: value }, { state: value }]),
    ];
    for (const change of changes) {
      anonymous.builder.abortSignal.mockResolvedValue({ data: { items: [cityRow(change)], total: 1 }, error: null });
      await expectPublicError(await GET(request()), 503);
    }
  });

  it("rejects duplicate and oversized provider results rather than deduplicating or truncating them", async () => {
    const oversized = Array.from({ length: 9 }, (_, index) => cityRow({ slug: `synthetic-unit-${index}` }));
    for (const items of [[cityRow(), cityRow({ name: "Synthetic Different City" })], oversized]) {
      anonymous.builder.abortSignal.mockResolvedValue({ data: { items, total: items.length }, error: null });
      await expectPublicError(await GET(request()), 503);
    }
  });

  it("treats SDK result errors as outages even when data is empty or apparently usable", async () => {
    for (const data of [null, { items: [], total: 0 }, { items: [cityRow()], total: 1 }]) {
      anonymous.builder.abortSignal.mockResolvedValue({
        data, error: { message: PRIVATE_ERROR, details: PRIVATE_ERROR, hint: PRIVATE_ERROR, code: "UNIT_ONLY" },
      });
      await expectPublicError(await GET(request("?q=Haza", ADMIN_COOKIE)), 503);
    }
  });

  it("sanitizes a client constructor exception without attempting RPC, fallback or another client", async () => {
    mocks.anonymousClient.mockImplementationOnce(() => { throw new Error(PRIVATE_ERROR); });
    await expectPublicError(await GET(request("?q=Haza", ADMIN_COOKIE)), 503);
    expect(mocks.anonymousClient).toHaveBeenCalledOnce();
    expect(anonymous.client.rpc).not.toHaveBeenCalled();
    expect(anonymous.builder.abortSignal).not.toHaveBeenCalled();
  });

  it("sanitizes a synchronous SDK RPC-builder exception instead of returning an empty success", async () => {
    anonymous.client.rpc.mockImplementationOnce(() => { throw new Error(PRIVATE_ERROR); });
    await expectPublicError(await GET(request()), 503);
    expect(anonymous.client.rpc).toHaveBeenCalledOnce();
    expect(anonymous.builder.abortSignal).not.toHaveBeenCalled();
  });

  it("sanitizes rejected requests, aborts and timeouts with Retry-After rather than a 200 empty result", async () => {
    for (const error of [new Error(PRIVATE_ERROR), new DOMException(PRIVATE_ERROR, "AbortError"), new DOMException(PRIVATE_ERROR, "TimeoutError")]) {
      anonymous.builder.abortSignal.mockRejectedValueOnce(error);
      await expectPublicError(await GET(request()), 503);
    }
    expect(anonymous.builder.abortSignal).toHaveBeenCalledTimes(3);
  });

  it("rechecks the same query and admin cookie after active -> inactive instead of caching public eligibility", async () => {
    anonymous.builder.abortSignal
      .mockResolvedValueOnce({ data: { items: [cityRow()], total: 1 }, error: null })
      .mockResolvedValueOnce({ data: { items: [cityRow({ status: "inactive" })], total: 1 }, error: null });
    await expectItems(await GET(queryRequest("Synthetic", ADMIN_COOKIE)), [PUBLIC_CITY]);
    await expectPublicError(await GET(queryRequest("Synthetic", ADMIN_COOKIE)), 503);
    expect(mocks.anonymousClient).toHaveBeenCalledTimes(2);
    expect(anonymous.client.rpc).toHaveBeenCalledTimes(2);
    expect(anonymous.builder.abortSignal.mock.calls[0][0]).not.toBe(anonymous.builder.abortSignal.mock.calls[1][0]);
  });

  it("observes removal on the next identical anonymous request without reusing an earlier suggestion", async () => {
    anonymous.builder.abortSignal
      .mockResolvedValueOnce({ data: { items: [cityRow()], total: 1 }, error: null })
      .mockResolvedValueOnce({ data: { items: [], total: 0 }, error: null });
    await expectItems(await GET(queryRequest("Synthetic")), [PUBLIC_CITY]);
    await expectItems(await GET(queryRequest("Synthetic")), []);
    expect(mocks.anonymousClient).toHaveBeenCalledTimes(2);
    expect(anonymous.client.rpc).toHaveBeenCalledTimes(2);
  });

  it("recovers on a fresh request after a provider failure without caching the sanitized error or inventing data", async () => {
    anonymous.builder.abortSignal
      .mockRejectedValueOnce(new Error(PRIVATE_ERROR))
      .mockResolvedValueOnce({ data: { items: [cityRow()], total: 1 }, error: null });
    await expectPublicError(await GET(queryRequest("Synthetic")), 503);
    await expectItems(await GET(queryRequest("Synthetic")), [PUBLIC_CITY]);
    expect(mocks.anonymousClient).toHaveBeenCalledTimes(2);
    expect(anonymous.client.rpc).toHaveBeenCalledTimes(2);
  });
});

function enableLocalFixtures(): void {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3100");
  vi.stubEnv("VERCEL", undefined);
  vi.stubEnv("SHAGUN_TEST_FIXTURES", "true");
}

describe("real local-only fixture boundaries", () => {
  it.each(["empty", "one", "many"])("uses only existing %s scenario data, with no geography or normal-preview fallback", async (scenario) => {
    enableLocalFixtures();
    vi.stubEnv("SHAGUN_FIXTURE_SCENARIO", scenario);
    // Hazaribag here is the existing explicitly local synthetic guide, not a
    // claim that the draft seed or the private geography catalog is published.
    const hazaribag: CitySuggestion = { name: "Hazaribag", slug: "hazaribag", state: "Jharkhand" };
    const emptyCity: CitySuggestion = { name: "Synthetic Empty City", slug: "synthetic-empty-city", state: "Synthetic Test Region" };
    const items = scenario === "empty" ? [] : scenario === "one" ? [hazaribag] : [hazaribag, emptyCity];
    await expectItems(await GET(request()), items);
    await expectItems(await GET(queryRequest("  Haza  ")), scenario === "empty" ? [] : [hazaribag]);
    await expectItems(await GET(queryRequest("unit-only-unmatched-city")), []);
    vi.stubEnv("SHAGUN_TEST_FIXTURES", "false");
    await expectItems(await GET(queryRequest("Haza")), []);
    expectNoPublicRead();
  });

  it("rechecks real fixture guards on every request and rejects hosted, remote and partial-key environments", async () => {
    enableLocalFixtures();
    vi.stubEnv("SHAGUN_FIXTURE_SCENARIO", "empty");
    await expectItems(await GET(request()), []);
    const forbiddenEnvironments: Array<Record<string, string>> = [
      { VERCEL: "1" },
      { NEXT_PUBLIC_SITE_URL: "https://remote.example.test" },
      { NEXT_PUBLIC_SITE_URL: "not-an-origin" },
      { NEXT_PUBLIC_SUPABASE_URL: "https://unit-project.example.test" },
      { NEXT_PUBLIC_SUPABASE_URL: "malformed-unit-url" },
      { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "unit-test-only-publishable-key" },
      { NEXT_PUBLIC_SUPABASE_URL: "https://unit-project.example.test", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "unit-test-only-publishable-key" },
    ];
    for (const environment of forbiddenEnvironments) {
      enableLocalFixtures();
      for (const [name, value] of Object.entries(environment)) vi.stubEnv(name, value);
      await expectPublicError(await GET(queryRequest("Haza")), 503);
    }
    expectNoPublicRead();
  });
});