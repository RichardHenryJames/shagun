import type { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { CookieOptions, createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { Database } from "@/lib/db/database.types";

type ClientArgs = Parameters<typeof createClient<Database, "shagun">>;
type ServerArgs = Parameters<typeof createServerClient<Database, "shagun">>;
type ServerOptions = ServerArgs[2];
type CookieWrites = Parameters<NonNullable<ServerOptions["cookies"]["setAll"]>>[0];
type CookieStore = {
  getAll: () => Array<{ name: string; value: string }>;
  set: (name: string, value: string, options: CookieOptions) => void;
};
const mocks = vi.hoisted(() => ({
  createClient: vi.fn<(...args: ClientArgs) => object>(),
  createServerClient: vi.fn<(...args: ServerArgs) => object>(),
  cookies: vi.fn<() => Promise<CookieStore>>(),
  getAll: vi.fn<CookieStore["getAll"]>(), set: vi.fn<CookieStore["set"]>(),
  getClaims: vi.fn<() => Promise<void>>(), fetch: vi.fn<typeof fetch>(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("sharp", () => { throw new Error("Client configuration must not load image processing."); });

import { adminCookieOptions, anonymousClient, serviceClient, sessionClient } from "@/lib/db/clients";
import { ADMIN_COOKIE_NAME, DB_SCHEMA, MEDIA_BUCKET } from "@/lib/db/schema";
import { config as proxyConfig, proxy } from "@/proxy";

// Synthetic credentials only. Both SDK constructors and fetch are mocked;
// this suite cannot connect to Auth, REST, Storage or an application's database.
const SITE = "https://shagun.example.test";
const PROJECT_URL = "https://shared-project.example.test";
const PUBLISHABLE_KEY = "unit-test-only-publishable-key";
const SERVICE_KEY = "unit-test-only-service-key";
const SIBLING_COOKIE = "sb-shared-project-auth-token";
const SIBLING_VALUE = "unit-test-only-sibling-session";
const COOKIE_POLICY = { httpOnly: true, sameSite: "lax", secure: true, path: "/" } as const;
const STATELESS_AUTH = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
const directClient = { testOnly: "stateless-client" };
const serverClient = { auth: { getClaims: mocks.getClaims } };
const factories = [["anonymous", anonymousClient], ["session", sessionClient], ["service", serviceClient]] as const;

function serverOptions(): ServerOptions {
  const options = mocks.createServerClient.mock.lastCall?.[2];
  if (!options) throw new Error("Expected an SSR constructor call.");
  return options;
}
function cookieWriter(options: ServerOptions) {
  const setAll = options.cookies.setAll;
  if (!setAll) throw new Error("Expected the SSR cookie write adapter.");
  return setAll;
}
function refreshEntries(): CookieWrites {
  return [
    { name: `${ADMIN_COOKIE_NAME}.0`, value: "test-only-part-0", options: { maxAge: 3600, httpOnly: false, sameSite: "none", secure: false, path: "/admin" } },
    { name: `${ADMIN_COOKIE_NAME}.1`, value: "test-only-part-1", options: { maxAge: 3600 } },
    { name: `${ADMIN_COOKIE_NAME}.2`, value: "", options: { maxAge: 0 } },
    { name: `${ADMIN_COOKIE_NAME}-code-verifier`, value: "test-only-verifier", options: { maxAge: 300 } },
  ];
}
function privateResponse(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", PROJECT_URL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", PUBLISHABLE_KEY);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY);
  mocks.createClient.mockReturnValue(directClient);
  mocks.createServerClient.mockReturnValue(serverClient);
  mocks.cookies.mockResolvedValue({ getAll: mocks.getAll, set: mocks.set });
  mocks.getAll.mockReturnValue([{ name: SIBLING_COOKIE, value: SIBLING_VALUE }]);
  mocks.getClaims.mockResolvedValue(undefined);
  mocks.fetch.mockImplementation(() => { throw new Error("Network access is forbidden in client unit tests."); });
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Shagun client schema contract", () => {
  it("exposes only the application schema and distinct bucket/cookie namespaces", () => {
    expect(DB_SCHEMA).toBe("shagun");
    expect(MEDIA_BUCKET).toBe("shagun-media");
    expect(ADMIN_COOKIE_NAME).toBe("shagun-admin-auth");
    expect(ADMIN_COOKIE_NAME).not.toBe(SIBLING_COOKIE);
    expectTypeOf<keyof Database>().toEqualTypeOf<"shagun">();
    expectTypeOf<typeof DB_SCHEMA>().toEqualTypeOf<"shagun">();
    expectTypeOf<ReturnType<typeof anonymousClient>>().toEqualTypeOf<SupabaseClient<Database, "shagun">>();
    expectTypeOf<ReturnType<typeof serviceClient>>().toEqualTypeOf<SupabaseClient<Database, "shagun">>();
    expectTypeOf<Awaited<ReturnType<typeof sessionClient>>>().toEqualTypeOf<SupabaseClient<Database, "shagun">>();
  });

  it.each([
    ["anonymous", anonymousClient, PUBLISHABLE_KEY],
    ["service", serviceClient, SERVICE_KEY],
  ] as const)("scopes the %s constructor without persisting or refreshing a session", (_name, construct, key) => {
    expect(construct()).toBe(directClient);
    expect(mocks.createClient).toHaveBeenCalledExactlyOnceWith(PROJECT_URL, key, {
      db: { schema: "shagun" }, auth: STATELESS_AUTH, global: { fetch: expect.any(Function) },
    });
    expect(mocks.createServerClient).not.toHaveBeenCalled();
    expect(mocks.cookies).not.toHaveBeenCalled();
    expect(mocks.getAll).not.toHaveBeenCalled();
    expect(mocks.getClaims).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("scopes the session constructor using the publishable key, not the service key", async () => {
    await expect(sessionClient()).resolves.toBe(serverClient);
    expect(mocks.createServerClient).toHaveBeenCalledExactlyOnceWith(PROJECT_URL, PUBLISHABLE_KEY, {
      db: { schema: "shagun" }, global: { fetch: expect.any(Function) },
      cookieOptions: { name: "shagun-admin-auth", ...COOKIE_POLICY },
      cookies: { getAll: expect.any(Function), setAll: expect.any(Function) },
    });
    expect(mocks.cookies).toHaveBeenCalledExactlyOnceWith();
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.getClaims).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each(factories)("reads %s credentials from the current environment, not a hardcoded project", async (name, construct) => {
    const url = "https://alternate-project.example.test";
    const publishable = "test-only-alternate-publishable-key";
    const service = "test-only-alternate-service-key";
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", publishable);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", service);
    await construct();
    const call = mocks.createClient.mock.lastCall ?? mocks.createServerClient.mock.lastCall;
    expect(call?.slice(0, 2)).toEqual([url, name === "service" ? service : publishable]);
    expect(call?.[2]?.db).toEqual({ schema: "shagun" });
  });

  it.each(factories)("keeps %s requests uncached even when the caller asks for caching", async (_name, construct) => {
    await construct();
    const options = mocks.createClient.mock.lastCall?.[2] ?? mocks.createServerClient.mock.lastCall?.[2];
    const fetcher = options?.global?.fetch;
    if (!fetcher) throw new Error("Expected the uncached fetch adapter.");
    const response = new Response(null, { status: 204 });
    mocks.fetch.mockResolvedValue(response);
    const input = `${PROJECT_URL}/rest/v1/cities`;
    const init: RequestInit = { method: "GET", cache: "force-cache", headers: { "x-unit-test": "synthetic" } };
    await expect(fetcher(input, init)).resolves.toBe(response);
    expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith(input, { ...init, cache: "no-store" });
    expect(init.cache).toBe("force-cache");
  });

  it.each(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"])("fails closed without %s and leaves the unconfigured proxy private", async (variable) => {
    vi.stubEnv(variable, "");
    expect(anonymousClient).toThrow("Database is not configured.");
    await expect(sessionClient()).rejects.toThrow("Database is not configured.");
    expect(serviceClient).toThrow("Database is not configured.");
    const response = await proxy(new NextRequest(`${SITE}/admin`));
    privateResponse(response);
    expect(response.cookies.getAll()).toEqual([]);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.createServerClient).not.toHaveBeenCalled();
    expect(mocks.cookies).not.toHaveBeenCalled();
    expect(mocks.getClaims).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("requires service credentials only for the privileged constructor, with no anonymous fallback", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(serviceClient).toThrow("Server credentials are not configured.");
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(anonymousClient()).toBe(directClient);
    await expect(sessionClient()).resolves.toBe(serverClient);
    expect(mocks.createClient.mock.lastCall?.[1]).toBe(PUBLISHABLE_KEY);
    expect(mocks.createServerClient.mock.lastCall?.[1]).toBe(PUBLISHABLE_KEY);
  });
});

describe("independent Shagun SSR cookies", () => {
  it.each([[SITE, true], ["http://localhost:3100", false]] as const)("uses matching session/proxy policies at %s", async (site, secure) => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", site);
    const policy = { ...COOKIE_POLICY, secure };
    expect(adminCookieOptions()).toEqual(policy);
    expect(adminCookieOptions()).not.toHaveProperty("name");
    await sessionClient();
    const sessionOptions = serverOptions();
    const response = await proxy(new NextRequest(`${site}/admin`));
    const proxyOptions = serverOptions();
    for (const options of [sessionOptions, proxyOptions]) {
      expect(options.db).toEqual({ schema: "shagun" });
      expect(options.cookieOptions).toEqual({ name: "shagun-admin-auth", ...policy });
      expect(options.cookieOptions).not.toHaveProperty("domain");
    }
    expect(mocks.createServerClient).toHaveBeenCalledTimes(2);
    expect(mocks.createServerClient.mock.lastCall?.slice(0, 2)).toEqual([PROJECT_URL, PUBLISHABLE_KEY]);
    expect(mocks.getClaims).toHaveBeenCalledExactlyOnceWith();
    privateResponse(response);
  });

  it("preserves SSR chunk, deletion and PKCE names while enforcing cookie flags", async () => {
    const incoming = [
      { name: SIBLING_COOKIE, value: SIBLING_VALUE },
      { name: `${ADMIN_COOKIE_NAME}.0`, value: "test-only-old-shagun-part" },
    ];
    mocks.getAll.mockReturnValue(incoming);
    await sessionClient();
    const options = serverOptions();
    expect(await options.cookies.getAll()).toEqual(incoming);
    const entries = refreshEntries();
    await cookieWriter(options)(entries, {});
    expect(mocks.set).toHaveBeenCalledTimes(entries.length);
    for (const [index, entry] of entries.entries()) {
      expect(mocks.set).toHaveBeenNthCalledWith(index + 1, entry.name, entry.value, { ...entry.options, ...COOKIE_POLICY });
      expect(mocks.set.mock.calls[index][2]).not.toHaveProperty("name");
    }
    expect(mocks.set.mock.calls.map(([name]) => name)).toEqual(entries.map(({ name }) => name));
    expect(mocks.set.mock.calls.map(([name]) => name)).not.toContain(SIBLING_COOKIE);
    expect(incoming[0]).toEqual({ name: SIBLING_COOKIE, value: SIBLING_VALUE });
  });

  it("tolerates a read-only Server Component cookie store without falling back to another client", async () => {
    mocks.set.mockImplementation(() => { throw new Error("Synthetic read-only cookie store."); });
    await expect(sessionClient()).resolves.toBe(serverClient);
    await cookieWriter(serverOptions())(refreshEntries(), {});
    expect(mocks.set).toHaveBeenCalledOnce();
    expect(mocks.createServerClient).toHaveBeenCalledOnce();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("binds each session client to its own request cookie store", async () => {
    const first = [{ name: ADMIN_COOKIE_NAME, value: "test-only-first-request" }];
    const second = [{ name: ADMIN_COOKIE_NAME, value: "test-only-second-request" }];
    mocks.cookies.mockResolvedValueOnce({ getAll: () => first, set: mocks.set })
      .mockResolvedValueOnce({ getAll: () => second, set: mocks.set });
    await sessionClient();
    const firstOptions = serverOptions();
    await sessionClient();
    const secondOptions = serverOptions();
    expect(await firstOptions.cookies.getAll()).toEqual(first);
    expect(await secondOptions.cookies.getAll()).toEqual(second);
    expect(firstOptions.cookies).not.toBe(secondOptions.cookies);
    expect(mocks.cookies).toHaveBeenCalledTimes(2);
    expect(mocks.createServerClient).toHaveBeenCalledTimes(2);
  });
});

describe("private proxy session refresh", () => {
  it("forwards only Shagun cookie updates without overwriting siblings or caching the response", async () => {
    const request = new NextRequest(`${SITE}/admin/cities`, {
      headers: { cookie: `${SIBLING_COOKIE}=${SIBLING_VALUE}; ${ADMIN_COOKIE_NAME}.0=test-only-old-shagun-part` },
    });
    const entries = refreshEntries();
    mocks.getClaims.mockImplementation(async () => {
      const options = serverOptions();
      expect(await options.cookies.getAll()).toEqual(request.cookies.getAll());
      await cookieWriter(options)(entries, {
        "Cache-Control": "public, max-age=3600", Expires: "0", Pragma: "no-cache",
      });
    });
    const response = await proxy(request);
    expect(serverOptions().db).toEqual({ schema: "shagun" });
    expect(serverOptions().cookieOptions).toEqual({ name: "shagun-admin-auth", ...COOKIE_POLICY });
    expect(mocks.createServerClient.mock.lastCall?.slice(0, 2)).toEqual([PROJECT_URL, PUBLISHABLE_KEY]);
    expect(mocks.getClaims).toHaveBeenCalledExactlyOnceWith();
    expect(mocks.cookies).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(response.cookies.getAll().map(({ name }) => name)).toEqual(entries.map(({ name }) => name));
    for (const entry of entries) {
      expect(request.cookies.get(entry.name)?.value).toBe(entry.value);
      expect(response.cookies.get(entry.name)).toMatchObject({ name: entry.name, value: entry.value, ...entry.options, ...COOKIE_POLICY });
    }
    expect(request.cookies.get(SIBLING_COOKIE)?.value).toBe(SIBLING_VALUE);
    expect(response.cookies.get(SIBLING_COOKIE)).toBeUndefined();
    expect(response.cookies.get(ADMIN_COOKIE_NAME)).toBeUndefined();
    expect(response.headers.get("x-middleware-request-cookie")).toContain(`${ADMIN_COOKIE_NAME}.0=test-only-part-0`);
    expect(response.headers.get("expires")).toBe("0");
    expect(response.headers.get("pragma")).toBe("no-cache");
    privateResponse(response);
  });

  it("keeps route-level authorization in control when Auth refresh is unavailable", async () => {
    mocks.getClaims.mockRejectedValue(new Error("Synthetic private Auth provider detail."));
    const response = await proxy(new NextRequest(`${SITE}/api/admin/media`));
    privateResponse(response);
    expect(response.cookies.getAll()).toEqual([]);
    expect(mocks.getClaims).toHaveBeenCalledOnce();
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(await response.text()).toBe("");
  });

  it("refreshes only private routes, leaving public discovery session-free", () => {
    expect(proxyConfig.matcher).toEqual(["/admin/:path*", "/api/admin/:path*"]);
  });
});