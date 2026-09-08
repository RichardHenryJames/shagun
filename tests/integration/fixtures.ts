import { createHmac, randomUUID } from "node:crypto";
import { expect, type APIResponse, type Browser, type BrowserContext, type Locator, type Page, type Response, type TestInfo } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import sharp from "sharp";
import { z } from "zod";
import type { Database } from "../../src/lib/db/database.types";
import type { City, Photo } from "../../src/lib/types";

export const INTEGRATION_ORIGIN = "http://localhost:3200";
export const LOCAL_SUPABASE_ORIGIN = "http://127.0.0.1:55321";
export const INTEGRATION_WIDTHS = [390, 768, 1440] as const;
export const CITY_PATH = "/city/chapra";
export const CITY_WORKSPACE = "/admin/cities/chapra";
export const MEDIA_BUCKET = "shagun-media";
export const ADMIN_COOKIE = "shagun-admin-auth";
export const IMAGE_BYTES_LIMIT = 3 * 1024 * 1024;
export const SAME_ORIGIN = { Origin: INTEGRATION_ORIGIN, "Sec-Fetch-Site": "same-origin" };
export const LOGIN_REJECTION = "Unable to sign in. Check your credentials and administrator access, then try again.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type LocalClient = SupabaseClient<Database, "shagun">;
export type Credentials = { email: string; password: string };
export type IntegrationEnvironment = {
  publishableKey: string; serviceRoleKey: string; rateLimitSecret: string;
  admin: Credentials; nonadmin: Credentials;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing integration environment variable: ${name}. Values must be supplied privately by the parent.`);
  return value;
}

function credentials(role: "ADMIN" | "NONADMIN", width?: number): Credentials {
  const base = `SHAGUN_E2E_${role}`;
  // Optional per-width accounts preserve the production five-attempt/15-minute
  // login budget. Three wrong/correct pairs exceed one account's budget; use
  // per-width accounts or separate fresh runs, never a test-only limiter bypass.
  const suffix = width && (process.env[`${base}_EMAIL_${width}`] || process.env[`${base}_PASSWORD_${width}`]) ? `_${width}` : "";
  const email = required(`${base}_EMAIL${suffix}`);
  const password = required(`${base}_PASSWORD${suffix}`);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12 || password.length > 128) {
    throw new Error(`The privately supplied ${role.toLowerCase()} credentials are invalid. No value was logged.`);
  }
  return { email, password };
}

function requireLegacyRole(key: string, role: "anon" | "service_role"): void {
  let valid = false;
  try {
    const parts = key.split(".");
    const payload: unknown = JSON.parse(Buffer.from(parts[1] ?? "", "base64url").toString("utf8"));
    valid = parts.length === 3 && Boolean(payload && typeof payload === "object" && "role" in payload && payload.role === role);
  } catch { /* A fixed error below must not print a JWT or decoder input. */ }
  if (!valid) throw new Error(`Integration requires the parent's local legacy ${role} key, not another role or a hosted credential.`);
}

/** Called by both config and fixtures, before any server or network operation. */
export function integrationEnvironment(width?: number): IntegrationEnvironment {
  if (Object.keys(process.env).some((name) => /^VERCEL(?:_|$)/i.test(name))) {
    throw new Error("Integration is forbidden in a Vercel environment, including VERCEL=0.");
  }
  if (process.env.DEBUG || process.env.PWDEBUG || process.env.PW_TEST_CONNECT_WS_ENDPOINT) {
    throw new Error("Credential-bearing integration tests forbid debug protocol logging, Inspector and remote browser connections.");
  }
  if (process.env.SHAGUN_INTEGRATION_TEST !== "true" || process.env.SHAGUN_TEST_FIXTURES !== "false"
    || process.env.NEXT_PUBLIC_SITE_URL !== INTEGRATION_ORIGIN
    || process.env.NEXT_PUBLIC_SUPABASE_URL !== LOCAL_SUPABASE_ORIGIN) {
    throw new Error("Integration requires SHAGUN_INTEGRATION_TEST=true, SHAGUN_TEST_FIXTURES=false, exactly http://localhost:3200 and exactly http://127.0.0.1:55321. No alternate host, path, port or origin is accepted.");
  }
  const publishableKey = required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const rateLimitSecret = required("RATE_LIMIT_SECRET");
  requireLegacyRole(publishableKey, "anon");
  requireLegacyRole(serviceRoleKey, "service_role");
  if (rateLimitSecret.length < 32) throw new Error("The integration rate-limit secret must contain at least 32 characters.");
  const admin = credentials("ADMIN", width);
  const nonadmin = credentials("NONADMIN", width);
  if (admin.email.trim().toLowerCase() === nonadmin.email.trim().toLowerCase()) {
    throw new Error("Integration admin and non-admin must be different local Auth identities.");
  }
  return { publishableKey, serviceRoleKey, rateLimitSecret, admin, nonadmin };
}

export function assertRunConfiguration(info: TestInfo): number {
  const use = info.project.use;
  const width = use.viewport?.width;
  if (use.baseURL !== INTEGRATION_ORIGIN || !INTEGRATION_WIDTHS.some((value) => value === width)
    || info.config.workers !== 1 || info.project.retries !== 0 || info.config.maxFailures !== 1
    || use.screenshot !== "off" || use.trace !== "off" || use.video !== "off" || use.storageState
    || use.connectOptions || process.env.PLAYWRIGHT_NO_COPY_PROMPT !== "1") {
    throw new Error("Use the isolated integration config without overriding origin, widths, workers, retries, maxFailures, storageState or disabled sensitive artifacts.");
  }
  return width!;
}

/** SDK traffic cannot follow a redirect or escape to a hosted Supabase. */
const localFetch: typeof fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.origin !== LOCAL_SUPABASE_ORIGIN || url.username || url.password) throw new Error("Blocked non-local Supabase request.");
  try {
    return await fetch(input, {
      ...init, cache: "no-store", redirect: "error",
      signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000),
    });
  } catch { throw new Error("The isolated local Supabase request failed. Provider details were not logged."); }
};

export function localClients(env: IntegrationEnvironment) {
  const client = (key: string) => createClient<Database, "shagun">(LOCAL_SUPABASE_ORIGIN, key, {
    db: { schema: "shagun" }, global: { fetch: localFetch },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  // Service role is an observer only: no inventory insert/update/delete, SQL,
  // provisioning, bucket changes or direct Storage removal occurs in this suite.
  return { anonymous: client(env.publishableKey), observer: client(env.serviceRoleKey) };
}

/** The actual UI-issued HttpOnly session, using Supabase's own cookie codec.
 * refreshSession/signInWithPassword still contact real local GoTrue. This never
 * manufactures tokens, edits claims, installs an auth mock, or writes a state file. */
export function browserSession(context: BrowserContext, env: IntegrationEnvironment): LocalClient {
  return createServerClient<Database, "shagun">(LOCAL_SUPABASE_ORIGIN, env.publishableKey, {
    db: { schema: "shagun" }, global: { fetch: localFetch },
    cookieOptions: { name: ADMIN_COOKIE, httpOnly: true, sameSite: "lax", secure: false, path: "/" },
    cookies: {
      getAll: async () => (await context.cookies(INTEGRATION_ORIGIN)).map(({ name, value }) => ({ name, value })),
      setAll: async (entries) => {
        try {
          await context.addCookies(entries.map(({ name, value, options }) => ({
            name, value, domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" as const,
            ...(options.maxAge !== undefined ? { expires: options.maxAge <= 0 ? 1 : Math.floor(Date.now() / 1000) + options.maxAge }
              : options.expires ? { expires: Math.floor(options.expires.getTime() / 1000) } : {}),
          })));
        } catch { throw new Error("Applying the real local Auth cookie update failed; cookie values were not logged."); }
      },
    },
  });
}

// getByLabel matches DOM label text, including the form's aria-hidden required
// star. Keep the exact field name (not a substring such as Phone/Alternate phone).
export function field(scope: Page | Locator, label: string): Locator {
  const literal = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return scope.getByLabel(new RegExp(`^${literal}(?:\\s*\\*)?$`));
}

export function checked<T>(result: { data: T; error: unknown }, operation: string): T {
  if (result.error) throw new Error(`${operation} failed against isolated Supabase. Response details were not logged.`);
  return result.data;
}

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("An expected response object was missing.");
  return value as Record<string, unknown>;
}

export function savedId(value: string | null): string {
  if (!value || !UUID.test(value)) throw new Error("The UI did not return a saved UUIDv4 record identifier.");
  return value;
}

export function newInventory(width: number) {
  const token = randomUUID().replaceAll("-", "");
  const venueName = `Synthetic Local Hall ${width} ${token}`;
  return {
    token, venueName, venueSlug: venueName.toLowerCase().replaceAll(" ", "-"),
    cityDescription: `SYNTHETIC LOCAL INTEGRATION TEST ONLY. Temporary Chapra workspace ${token}; not a real public city guide.`,
    venueDescription: `SYNTHETIC LOCAL INTEGRATION TEST ONLY. ${token}. No real venue, availability, contact verification or image rights research is claimed.`,
    address: "Synthetic local-only test address, Example Lane, Chapra. Not a real venue location.",
    privateMarker: `TEST_PRIVATE_${token}`,
    sourceNotes: `TEST_PRIVATE_${token}: Original generated local test data only. The reserved example telephone is not contacted. This is not real editorial research or a review of a real venue.`,
    cityId: undefined as string | undefined, venueId: undefined as string | undefined,
    photos: [] as Photo[], citySaveStarted: false, venueSaveStarted: false, cleanupComplete: false,
    baseline: undefined as City | undefined,
  };
}
export type OwnedInventory = ReturnType<typeof newInventory>;

export function publicSafety(env: IntegrationEnvironment, owned: OwnedInventory) {
  const forbidden = [owned.privateMarker, env.serviceRoleKey, env.rateLimitSecret, env.admin.password, env.nonadmin.password];
  return (body: string) => {
    // Assert a boolean, never the body or matched secret (including on failure).
    expect(forbidden.some((value) => body.includes(value)), "A public/preview response must not contain private sources or credentials").toBe(false);
  };
}

export async function isolatedContext(browser: Browser, width: number, checkBody: (body: string) => void) {
  const context = await browser.newContext({
    baseURL: INTEGRATION_ORIGIN, viewport: { width, height: width >= 768 ? 1000 : 844 },
    locale: "en-IN", timezoneId: "Asia/Kolkata", reducedMotion: "reduce", deviceScaleFactor: 1,
    serviceWorkers: "block", acceptDownloads: false,
  });
  context.setDefaultTimeout(10_000);
  context.setDefaultNavigationTimeout(30_000);
  let external = 0;
  let leaks = 0;
  const pending = new Set<Promise<void>>();
  // Egress denylist only. ALL allowed Auth, HTML, RSC, API and image requests
  // continue unchanged; there is no route.fulfill(), auth bypass or response stub.
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (![INTEGRATION_ORIGIN, LOCAL_SUPABASE_ORIGIN].includes(url.origin) || url.username || url.password) {
      external++;
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });
  context.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin !== INTEGRATION_ORIGIN || /^\/(?:admin|api\/admin)(?:\/|$)/.test(url.pathname)
      || !/(?:text\/|javascript|json)/i.test(response.headers()["content-type"] ?? "")) return;
    const task = (async () => {
      let body: string;
      try { body = await response.text(); }
      catch { return; } // Cancelled prefetches have no completed response body.
      try { checkBody(body); } catch { leaks++; }
    })();
    pending.add(task);
    void task.finally(() => pending.delete(task));
  });
  return {
    context,
    async assertSafe() {
      await Promise.all([...pending]);
      expect(external, "No browser request may leave the two isolated loopback origins").toBe(0);
      expect(leaks, "Public documents, RSC payloads and assets must not disclose private data").toBe(0);
    },
  };
}

export async function login(page: Page, identity: Credentials): Promise<void> {
  await page.goto("/admin/login");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in to Shagun");
  // Locator action failures can normally include fill arguments. Replace them
  // with a fixed error, and never attach/log the underlying exception or state.
  try {
    await page.getByRole("textbox", { name: "Email address", exact: true }).fill(identity.email);
    await field(page, "Password").fill(identity.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  } catch { throw new Error("Credential form interaction failed; sensitive action details were suppressed."); }
}

export async function assertLoginRejected(page: Page): Promise<void> {
  await expect(page.getByRole("alert")).toHaveText(LOGIN_REJECTION);
  await expect(page).toHaveURL(`${INTEGRATION_ORIGIN}/admin/login`);
  await expect(page.getByRole("navigation", { name: "Administration" })).toHaveCount(0);
  await field(page, "Password").fill("");
}

export async function assertSignedOut(page: Page, path: string): Promise<void> {
  const response = await page.goto(path);
  await expect(page).toHaveURL(`${INTEGRATION_ORIGIN}/admin/login`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in to Shagun");
  expect(response?.headers()["cache-control"]).toMatch(/private.*no-store/i);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
}

export async function assertDenied(response: APIResponse): Promise<void> {
  expect([401, 403], "A real authorization rejection is required, not an origin error, redirect, 404 or 500").toContain(response.status());
  expect(response.headers()["location"]).toBeUndefined();
  expect(response.headers()["cache-control"]).toMatch(/no-store/i);
  expect(response.headers()["content-type"]).toMatch(/application\/json/i);
  const body = record(await response.json());
  expect(typeof body.error).toBe("string");
  expect(/origin|csrf/i.test(String(body.error))).toBe(false);
  expect(Object.hasOwn(body, "photo") || Object.hasOwn(body, "items")).toBe(false);
}

export async function assertLoginBudget(observer: LocalClient, env: IntegrationEnvironment, width: number): Promise<void> {
  const digest = createHmac("sha256", env.rateLimitSecret).update(`admin-login-email:${env.admin.email.trim().toLowerCase()}`).digest("hex");
  const budget = checked(await observer.from("rate_limits").select("hits,resets_at")
    .eq("key", `admin-login-email:${digest}`).maybeSingle(), "Read-only login budget check");
  if (budget && Date.parse(budget.resets_at) > Date.now() && budget.hits + 2 > 5) {
    throw new Error(`The unchanged account limiter cannot fit this workflow's two UI login attempts. Have the parent provision SHAGUN_E2E_ADMIN_EMAIL_${width} and SHAGUN_E2E_ADMIN_PASSWORD_${width}, or reset the isolated local run. No limiter rows were changed.`);
  }
}

export async function assertFreshInventory(observer: LocalClient, owned: OwnedInventory): Promise<void> {
  const cities = checked(await observer.from("cities").select("*").order("slug"), "Read initial local cities");
  if (!cities || cities.length !== 1 || cities[0].slug !== "hazaribag" || cities[0].status !== "draft"
    || cities[0].name !== "Hazaribag" || cities[0].state !== "Jharkhand" || cities[0].country !== "India") {
    throw new Error("Refusing non-fresh inventory. Only the actual draft Hazaribag seed may exist; never remove a preexisting Chapra or other record.");
  }
  for (const table of ["venues", "media_assets", "storage_cleanup_jobs"] as const) {
    const result = await observer.from(table).select("id", { count: "exact", head: true });
    checked(result, `Read initial ${table} count`);
    expect(result.count, "The parent must supply a fresh, empty local inventory/media queue").toBe(0);
  }
  const bucket = checked(await observer.storage.getBucket(MEDIA_BUCKET), "Inspect actual local Storage bucket");
  expect(bucket?.public, "The real shagun-media bucket must remain private").toBe(false);
  const stored = checked(await observer.storage.from(MEDIA_BUCKET).list("", { limit: 1 }), "Inspect initial local Storage contents");
  expect(stored?.length, "A fresh local run must not contain unowned Storage objects").toBe(0);
  owned.baseline = cities[0];
}

export const editor = (page: Page) => page.locator("form.a-editor-form");

export async function submitEditor(page: Page, label: string): Promise<Response> {
  const pathname = new URL(page.url()).pathname;
  const [response] = await Promise.all([
    page.waitForResponse((value) => value.request().method() === "POST"
      && new URL(value.url()).origin === INTEGRATION_ORIGIN && new URL(value.url()).pathname === pathname),
    editor(page).getByRole("button", { name: label, exact: true }).click(),
  ]);
  expect([200, 303]).toContain(response.status());
  return response;
}

export async function saveExisting(page: Page, kind: "city" | "venue"): Promise<void> {
  const version = editor(page).locator('input[name="expected_updated_at"]');
  const before = await version.inputValue();
  expect(before).not.toBe("");
  await submitEditor(page, `Save ${kind}`);
  // Keep the exact optimistic version string. Never normalize it via Date.
  await expect(version).not.toHaveValue(before);
  await expect(editor(page).getByRole("alert")).toHaveCount(0);
  await expect(editor(page).getByRole("button", { name: `Save ${kind}`, exact: true })).toBeEnabled();
}

export async function setVenueStatus(page: Page, owned: OwnedInventory, status: "published" | "unpublished"): Promise<void> {
  await page.goto(`/admin/venues/${savedId(owned.venueId ?? null)}`);
  await expect(editor(page).locator('input[name="id"]')).toHaveValue(owned.venueId!);
  await expect(page.getByRole("textbox", { name: "Venue name", exact: true })).toHaveValue(owned.venueName);
  await field(page, "Publication status").selectOption(status);
  if (status === "published") {
    const review = page.getByRole("checkbox", { name: /^I have reviewed the recorded facts and their sources\./ });
    await review.uncheck();
    await review.check();
  }
  await saveExisting(page, "venue");
  await expect(field(page, "Publication status")).toHaveValue(status);
}

export async function setCityStatus(page: Page, owned: OwnedInventory, status: "active" | "inactive"): Promise<void> {
  // A new document reloads published_count; do not use a stale disabled Active option.
  await page.goto(`${CITY_WORKSPACE}/edit`);
  await expect(editor(page).locator('input[name="id"]')).toHaveValue(savedId(owned.cityId ?? null));
  await expect(field(page, "City introduction")).toHaveValue(owned.cityDescription);
  if (status === "active") await expect(field(page, "City status").locator('option[value="active"]')).toBeEnabled();
  await field(page, "City status").selectOption(status);
  await saveExisting(page, "city");
  await expect(field(page, "City status")).toHaveValue(status);
}

export async function assertWorkspaceCounts(page: Page, published: number, drafts: number): Promise<void> {
  await page.goto(CITY_WORKSPACE);
  const stats = page.locator('dl[aria-label="Chapra recorded inventory"]');
  for (const [label, value] of [["Total venues", 1], ["Published", published], ["Drafts", drafts], ["Review / recheck", 1]] as const) {
    await expect(stats.locator("div").filter({ has: page.locator("dt").filter({ hasText: new RegExp(`^${label}$`) }) }).locator("dd")).toHaveText(String(value));
  }
}

export async function visitPublic(page: Page, path: string, status: 200 | 404, checkBody: (body: string) => void): Promise<void> {
  const response = await page.goto(path, { waitUntil: "load" });
  expect(response?.status(), "Public existence must be a real HTTP status, not streamed not-found content in a 200").toBe(status);
  if (!response) throw new Error("The public navigation had no document response.");
  checkBody(await response.text());
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
  await expect(page.getByRole("note").filter({ hasText: "Local test fixtures — not real venues" })).toHaveCount(0);
  if (status === 404) await expect(page.getByRole("heading", { level: 1 })).toHaveText(/This place isn’t\s*on the page\./);
}

export async function assertPreview(page: Page, path: string, heading: string | RegExp, checkBody: (body: string) => void): Promise<void> {
  const response = await page.goto(path);
  expect(response?.status()).toBe(200);
  expect(response?.headers()["cache-control"]).toMatch(/private.*no-store/i);
  expect(response?.headers()["x-robots-tag"]).toMatch(/noindex/i);
  if (!response) throw new Error("The authenticated preview had no document response.");
  checkBody(await response.text());
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex.*nofollow/);
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
}

export async function openFilters(page: Page): Promise<Locator> {
  if ((page.viewportSize()?.width ?? 0) < 992) {
    await page.getByRole("button", { name: /^Filters/ }).click();
    const dialog = page.getByRole("dialog", { name: "Refine your search" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Close filters" })).toBeFocused();
    return dialog;
  }
  const panel = page.getByRole("complementary", { name: "Venue filters" });
  await expect(panel).toBeVisible();
  return panel;
}

export async function loadedImage(image: Locator): Promise<void> {
  await image.scrollIntoViewIfNeeded();
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element) => element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0)).toBe(true);
}

export async function generatedImages(token: string) {
  // Original geometric pixels, not scraped/stock venue photos or an application
  // fixture route. Sharp produces genuine PNG, JPEG and WebP input bytes.
  const pixels = Buffer.alloc(800 * 500 * 3);
  for (let y = 0; y < 500; y++) for (let x = 0; x < 800; x++) {
    const colour = x > 170 && x < 630 && y > 120 && y < 380 ? [58, 93, 116] : [244, 228, 202];
    const offset = (y * 800 + x) * 3;
    pixels[offset] = colour[0]; pixels[offset + 1] = colour[1]; pixels[offset + 2] = colour[2];
  }
  const images = [];
  for (const [index, format] of (["png", "jpeg", "webp"] as const).entries()) {
    const buffer = await sharp(pixels, { raw: { width: 800, height: 500, channels: 3 } }).rotate(index * 180).toFormat(format).toBuffer();
    images.push({
      name: `synthetic-${token}-${index + 1}.${format}`, mimeType: `image/${format}`, buffer,
      alt: `Synthetic original geometric image ${index + 1}: a blue rectangle on cream. Not a venue photograph.`,
      credit: "Original geometric image generated for isolated local integration testing; synthetic, not a venue photograph.",
    });
  }
  return images;
}
export type GeneratedImage = Awaited<ReturnType<typeof generatedImages>>[number];

const photoSchema = z.object({
  id: z.uuid(), venue_id: z.uuid(), city_id: z.null(), storage_key: z.string().regex(UUID),
  alt_text: z.string(), credit: z.string(), width: z.number(), height: z.number(),
  sort_order: z.number().int(), is_cover: z.boolean(), created_at: z.string(),
});

export async function uploadPhoto(page: Page, owned: OwnedInventory, image: GeneratedImage): Promise<Photo> {
  const section = page.getByRole("region", { name: "Venue photos", exact: true });
  await field(section, "Choose images").setInputFiles({ name: image.name, mimeType: image.mimeType, buffer: image.buffer });
  await field(section, `Alternative text for ${image.name}`).fill(image.alt);
  await field(section, "Rights / provenance credit for this batch").fill(image.credit);
  const [response] = await Promise.all([
    page.waitForResponse((value) => value.url() === `${INTEGRATION_ORIGIN}/api/admin/media` && value.request().method() === "POST"),
    section.getByRole("button", { name: "Upload photos", exact: true }).click(),
  ]);
  expect(response.status()).toBe(201);
  const parsed = photoSchema.safeParse(record(await response.json()).photo);
  if (!parsed.success || parsed.data.venue_id !== owned.venueId) throw new Error("Upload did not confirm a photo owned by this run's UI-created venue.");
  // Capture before subsequent assertions: cleanup remains scoped even if the
  // UI refresh, decoded-size check or metadata expectation subsequently fails.
  const photo = parsed.data;
  owned.photos.push(photo);
  expect(photo.alt_text).toBe(image.alt);
  expect(photo.credit).toBe(image.credit);
  expect([photo.width, photo.height]).toEqual([800, 500]);
  await expect(section.getByRole("list", { name: "Saved photos in display order" }).getByRole("listitem")).toHaveCount(owned.photos.length);
  await expect(section.getByRole("progressbar", { name: "Selected files successfully uploaded" })).toHaveAttribute("value", "1");
  await section.getByRole("button", { name: `Dismiss ${image.name} from upload queue`, exact: true }).click();
  return photo;
}

export async function assertStoredVariants(observer: LocalClient, root: string, present: boolean): Promise<void> {
  savedId(root);
  const objects = checked(await observer.storage.from(MEDIA_BUCKET).list(root, { limit: 10 }), "Inspect this run's Storage root");
  expect(objects?.map((object) => object.name).sort()).toEqual(present ? ["1600.webp", "480.webp", "960.webp"] : []);
}

export async function assertImageResponse(response: APIResponse, privateImage: boolean, width = 480): Promise<void> {
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/^image\/webp\b/i);
  expect(response.headers()["cache-control"]).toMatch(privateImage ? /private.*no-store/i : /public.*max-age=60/i);
  const metadata = await sharp(await response.body()).metadata();
  expect(metadata.format).toBe("webp");
  expect(metadata.width).toBe(Math.min(width, 800));
  expect(metadata.height).toBe(Math.min(width, 800) * 5 / 8);
  expect(metadata.exif).toBeUndefined();
}

export async function runOwnedStorageCleanup(page: Page, observer: LocalClient, owned: OwnedInventory): Promise<void> {
  const jobs = checked(await observer.from("storage_cleanup_jobs").select("id,storage_key,ready_at"), "Inspect cleanup ownership");
  const roots = new Set(owned.photos.map((photo) => photo.storage_key));
  if (!jobs || jobs.some((job) => !roots.has(job.storage_key))) {
    throw new Error("Refusing the dashboard's global cleanup: an unowned reservation/job exists. The parent must inspect/reset the isolated run.");
  }
  if (!jobs.length) return;
  expect(jobs.length).toBeLessThanOrEqual(25);
  expect(jobs.every((job) => Date.parse(job.ready_at) <= Date.now()), "Only ready deletion jobs may be drained").toBe(true);
  await page.goto("/admin");
  const cleanup = page.getByRole("region", { name: "Storage cleanup", exact: true });
  await cleanup.getByRole("button", { name: "Retry storage cleanup", exact: true }).click();
  await expect(cleanup.getByRole("status")).toContainText(`Stored files removed for ${jobs.length} cleanup job`);
  await expect(cleanup.getByRole("button", { name: "No cleanup pending", exact: true })).toBeDisabled();
  const remaining = checked(await observer.from("storage_cleanup_jobs").select("id").in("storage_key", [...roots]), "Verify acknowledged owned cleanup jobs");
  expect(remaining).toEqual([]);
  for (const job of jobs) await assertStoredVariants(observer, job.storage_key, false);
}

async function deleteFromUI(page: Page, kind: "city" | "venue", id: string, name: string): Promise<void> {
  await expect(editor(page).locator('input[name="id"]')).toHaveValue(savedId(id));
  await page.locator(`#${kind}-delete > summary`).click();
  const confirmation = field(page, `Type “${name}” to confirm permanent deletion`);
  const button = page.getByRole("button", { name: `Permanently delete ${kind}`, exact: true });
  await expect(button).toBeDisabled();
  await confirmation.fill(`${name} WRONG`);
  await expect(button).toBeDisabled();
  await confirmation.fill(name);
  await button.click();
  await expect(page).toHaveURL(`${INTEGRATION_ORIGIN}/admin/${kind === "city" ? "cities" : "venues"}`);
}

/** Normal path AND finally path: UI-only, guarded exact IDs/names. No service-
 * role DELETE/TRUNCATE, broad filters, status bypass, guessed IDs or Auth cleanup.
 * A failed cleanup is reported, not hidden by deleting an unfamiliar record. */
export async function cleanupOwned(page: Page, observer: LocalClient, owned: OwnedInventory): Promise<void> {
  if (owned.cleanupComplete) return;
  if (owned.venueId) {
    const venue = checked(await observer.from("venues").select("id,city_id,name,status,description").eq("id", owned.venueId).maybeSingle(), "Inspect owned venue before UI deletion");
    if (venue) {
      if (venue.city_id !== owned.cityId || venue.name !== owned.venueName || venue.description !== owned.venueDescription) throw new Error("Owned venue identity changed; refusing cleanup.");
      await page.goto(`/admin/venues/${owned.venueId}`);
      if (venue.status === "published") await setVenueStatus(page, owned, "unpublished");
      await deleteFromUI(page, "venue", owned.venueId, owned.venueName);
    }
    expect(checked(await observer.from("venues").select("id").eq("id", owned.venueId), "Confirm owned venue deletion")).toEqual([]);
    expect(checked(await observer.from("venue_research").select("venue_id").eq("venue_id", owned.venueId), "Confirm private research cascade")).toEqual([]);
    expect(checked(await observer.from("venue_facilities").select("venue_id").eq("venue_id", owned.venueId), "Confirm facility cascade")).toEqual([]);
    expect(checked(await observer.from("media_assets").select("id").eq("venue_id", owned.venueId), "Confirm media cascade")).toEqual([]);
  }
  if (owned.cityId) {
    const city = checked(await observer.from("cities").select("id,name,slug,status,description").eq("id", owned.cityId).maybeSingle(), "Inspect owned city before UI deletion");
    if (city) {
      if (city.name !== "Chapra" || city.slug !== "chapra" || city.description !== owned.cityDescription) throw new Error("Owned city identity changed; refusing cleanup.");
      await page.goto(`${CITY_WORKSPACE}/edit`);
      if (city.status !== "inactive") await setCityStatus(page, owned, "inactive");
      await deleteFromUI(page, "city", owned.cityId, "Chapra");
    }
    expect(checked(await observer.from("cities").select("id").eq("id", owned.cityId), "Confirm owned city deletion")).toEqual([]);
  }
  await runOwnedStorageCleanup(page, observer, owned);
  for (const photo of owned.photos) await assertStoredVariants(observer, photo.storage_key, false);
  if ((owned.citySaveStarted && !owned.cityId) || (owned.venueSaveStarted && !owned.venueId)) {
    throw new Error("A UI create result was not captured. No guessed ID was deleted; inspect/reset the isolated database before another run.");
  }
  if (owned.baseline) {
    const cities = checked(await observer.from("cities").select("*").order("slug"), "Verify preserved seed");
    expect(cities, "Cleanup must leave the original, unedited draft Hazaribag record").toEqual([owned.baseline]);
  }
  owned.cleanupComplete = true;
}