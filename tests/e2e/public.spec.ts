import AxeBuilder from "@axe-core/playwright";
import { expect, test as base, type APIResponse, type Locator, type Page, type Route } from "@playwright/test";

// Deliberately do not import server-only fixtures into the browser runner or replace app auth.
const ORIGIN = "http://localhost:3100";
const scenario = process.env.SHAGUN_FIXTURE_SCENARIO ?? "many";
const CITY_SUGGESTIONS = "/api/cities/suggestions";
const CITY = "/city/hazaribag";
const EMPTY_CITY = "/city/synthetic-empty-city";
const GALLERY = `${CITY}/vivah-bhawan/synthetic-gallery-hall`;
const MINIMAL = `${CITY}/vivah-bhawan/synthetic-minimal-hall`;
const FIRST_PHOTO = "30000000-0000-4000-8000-000000000001";
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const test = base.extend<{ localOnly: void }>({
  localOnly: [async ({ context, page }, run) => {
    const external: string[] = [];
    const pageErrors: string[] = [];
    const analytics: string[] = [];
    // No external accounts, fonts, photos, or analytics may be contacted during local browser QA.
    // Same-origin requests continue unmodified, including every real admin/auth boundary.
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (["http:", "https:"].includes(url.protocol) && url.origin !== ORIGIN) {
        external.push(url.href);
        return route.abort("blockedbyclient");
      }
      return route.continue();
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/events") analytics.push(request.url());
    });
    await run();
    expect.soft(external, "Browser requests must stay on the isolated local server").toEqual([]);
    expect.soft(pageErrors, "There must be no unhandled browser exceptions").toEqual([]);
    expect.soft(analytics, "Analytics must be disabled in the production QA build").toEqual([]);
  }, { auto: true }],
});

async function visit(page: Page, path: string): Promise<void> {
  const response = await page.goto(path, { waitUntil: "load" });
  expect(response?.status(), `GET ${path}`).toBe(200);
  await expect(page.getByRole("note").filter({ hasText: "Local test fixtures — not real venues" })).toBeVisible();
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("h1")).not.toHaveText("Finding the details.");
  await page.evaluate(async () => { await document.fonts.ready; });
}

async function noOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
  expect(dimensions.content, `Horizontal page overflow: ${JSON.stringify(dimensions)}`).toBeLessThanOrEqual(dimensions.viewport + 1);
}

async function noInventedMissingValues(page: Page): Promise<void> {
  const text = await page.locator("main").innerText();
  expect(text).not.toMatch(/₹\s*0(?:\D|$)|\b(?:Unknown|null|undefined)\b/i);
}

function venueNames(page: Page): Locator {
  return page.locator(".sh-venue-card h3");
}

async function openFilters(page: Page): Promise<Locator> {
  if ((page.viewportSize()?.width ?? 1440) < 992) {
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

async function loadedImage(image: Locator): Promise<void> {
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element) =>
    element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0,
  )).toBe(true);
}

async function focusStaysInDialog(page: Page, dialog: Locator): Promise<void> {
  for (const key of ["Shift+Tab", "Tab", "Tab", "Tab", "Tab", "Tab"]) {
    await page.keyboard.press(key);
    await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
}

function citySuggestionsResponse(page: Page, query: string) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.origin === ORIGIN && url.pathname === CITY_SUGGESTIONS && url.searchParams.get("q") === query;
  });
}

async function expectCitySuggestions(page: Page, input: Locator, query: string, count: number): Promise<void> {
  const list = page.getByRole("listbox", { name: "City suggestions", exact: true });
  const status = page.locator(".sh-city-search-form").getByRole("status");
  await expect(input).toHaveValue(query);
  await expect(input).toHaveAttribute("aria-busy", "false");
  await expect(input).toHaveAttribute("aria-expanded", String(count > 0));
  await expect(list.getByRole("option")).toHaveCount(count);
  if (count) {
    await expect(list).toBeVisible();
    await expect(status).toHaveText(`${count} public city ${count === 1 ? "guide" : "guides"} suggested. Use the arrow keys to choose, or submit to search.`);
  } else {
    await expect(list).toBeHidden();
    await expect(status).toHaveText(query.trim() ? "No public city guides match yet." : "No public city guides are available yet.");
    await expect(status).toBeVisible();
  }
}

async function holdCitySuggestions(page: Page, query: string) {
  type HeldSuggestions = { request: ReturnType<Route["request"]>; response: APIResponse };
  let accept!: (value: HeldSuggestions) => void;
  let reject!: (error: unknown) => void;
  const pending = new Promise<HeldSuggestions>((resolve, fail) => { accept = resolve; reject = fail; });
  let releaseResponse!: () => void;
  const releaseGate = new Promise<void>((resolve) => { releaseResponse = resolve; });
  let completion: Promise<void> | undefined;
  const matches = (url: URL) => url.origin === ORIGIN && url.pathname === CITY_SUGGESTIONS && url.searchParams.get("q") === query;
  const handler = (route: Route) => {
    completion = (async () => {
      try {
        // Delay the real local public response, never substitute city records or
        // touch a private catalog/auth endpoint. The test releases it explicitly.
        const response = await route.fetch({ maxRedirects: 0 });
        accept({ request: route.request(), response });
        // Keep the registered handler alive and the sole owner of fulfillment.
        await releaseGate;
        await route.fulfill({ response });
      } catch (error) {
        reject(error);
        throw error;
      }
    })();
    return completion;
  };
  await page.route(matches, handler, { times: 1 });
  return {
    pending,
    release: async () => {
      releaseResponse();
      if (completion) await completion;
    },
    remove: async () => {
      releaseResponse();
      try {
        // A consumed times:1 handler is no longer registered: drain it explicitly,
        // even if the test failed before receiving its pending response.
        if (completion) await completion;
      } finally {
        await page.unroute(matches, handler);
      }
    },
  };
}

const routes = [
  { name: "home", path: "/" },
  { name: "city directory", path: "/cities" },
  { name: "city search with no match", path: "/cities?q=nomatchfixture" },
  { name: "venue search", path: "/search" },
  { name: "venue search with no match", path: "/search?q=nomatchfixture" },
  { name: "about", path: "/about" },
  { name: "privacy", path: "/privacy" },
  { name: "unconfigured admin sign-in", path: "/admin/login" },
];
if (scenario !== "empty") routes.push({ name: "city guide", path: CITY }, { name: "gallery venue", path: GALLERY });
if (scenario === "many") routes.push(
  { name: "city page two", path: `${CITY}?page=2` },
  { name: "minimal venue", path: MINIMAL },
  { name: "empty synthetic guide", path: EMPTY_CITY },
);

test.describe("Responsive public pages", () => {
  for (const route of routes) {
    test(`${route.name}: one heading, honest values, no page overflow`, { tag: "@responsive" }, async ({ page }) => {
      await visit(page, route.path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await noOverflow(page);
      await noInventedMissingValues(page);
      for (const alt of await page.locator("img").evaluateAll((images) => images.map((image) => image.getAttribute("alt")))) {
        expect(alt, "Every image needs an explicit alternative, including decorative images").not.toBeNull();
      }
      if (route.name === "privacy") {
        await expect(page.getByText("Optional aggregate analytics are currently turned off.", { exact: true })).toBeVisible();
      }
    });
  }
});

test.describe("WCAG A/AA checks on key routes", () => {
  for (const route of routes.filter((entry) => !["city search with no match", "venue search with no match", "city page two"].includes(entry.name))) {
    test(`${route.name}: axe WCAG 2 A/AA, 2.1 A/AA and 2.2 AA`, { tag: "@a11y" }, async ({ page }) => {
      await visit(page, route.path);
      const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      expect(result.violations, JSON.stringify(result.violations, null, 2)).toEqual([]);
    });
  }
});

test("fixture scenarios expose only their intended local inventory", { tag: "@interaction" }, async ({ page }) => {
  await visit(page, "/cities");
  await expect(page.locator(".sh-city-card")).toHaveCount(scenario === "empty" ? 0 : scenario === "one" ? 1 : 2);
  if (scenario === "empty") {
    await expect(page.getByRole("heading", { name: "Every city deserves a thoughtful guide." })).toBeVisible();
    await visit(page, "/search");
    await expect(page.getByRole("heading", { name: "The directory is taking shape." })).toBeVisible();
    await expect(venueNames(page)).toHaveCount(0);
    return;
  }
  await visit(page, CITY);
  await expect(page.getByRole("heading", { name: scenario === "one" ? "1 venue to explore" : "16 venues to explore", exact: true })).toBeVisible();
  await expect(venueNames(page)).toHaveCount(scenario === "one" ? 1 : 12);
  await expect(venueNames(page).first()).toHaveText("Synthetic Gallery Hall");
  if (scenario === "one") await expect(page.getByRole("navigation", { name: "Results pages" })).toHaveCount(0);
});

test("keyboard skip link focuses the public main landmark", { tag: "@interaction" }, async ({ page }) => {
  await visit(page, "/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});

test("unconfigured login never offers demo access or accepts credentials", { tag: "@interaction" }, async ({ page }) => {
  await visit(page, "/admin/login");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Connect Supabase to continue");
  await expect(page.getByText("Administration is not configured", { exact: true })).toBeVisible();
  await expect(page.locator('input[type="password"], input[type="email"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toHaveCount(0);
  // Do not submit an invalid form here: there is intentionally no configured login form.
});

test.describe("Public city autocomplete", () => {
  const allCities = scenario === "empty" ? 0 : scenario === "one" ? 1 : 2;
  const matchingCities = scenario === "empty" ? 0 : 1;

  test("home and directory suggestions: accessible, anonymous and in bounds", { tag: "@responsive" }, async ({ page }) => {
    const privateRequests: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (/^\/(?:admin|api\/admin|auth)(?:\/|$)/.test(url.pathname)) privateRequests.push(url.pathname);
    });
    for (const entry of [
      { path: "/", id: "home-city-search", label: "Where are you celebrating?", button: "Find my city" },
      { path: "/cities", id: "directory-search", label: "Search for a city", button: "Find a city" },
    ]) {
      await visit(page, entry.path);
      const input = page.getByRole("combobox", { name: entry.label, exact: true });
      const form = page.locator(".sh-city-search-form");
      await expect(form).toHaveAttribute("action", "/cities");
      await expect(form).toHaveAttribute("method", "get");
      await expect(form.locator(`label[for="${entry.id}"]`)).toHaveText(entry.label);
      await expect(input).toHaveAttribute("type", "search");
      await expect(input).toHaveAttribute("name", "q");
      await expect(input).toHaveAttribute("autocomplete", "off");
      await expect(input).toHaveAttribute("spellcheck", "false");
      await expect(input).toHaveAttribute("maxlength", "100");
      await expect(input).toHaveAttribute("aria-expanded", "false");
      await expect(form.getByRole("status")).toHaveAttribute("aria-live", "polite");
      await expect(page.locator('a[href^="/admin"], input[type="password"], input[type="email"]')).toHaveCount(0);

      const firstResponse = citySuggestionsResponse(page, "");
      await input.focus();
      const response = await firstResponse;
      expect(response.status()).toBe(200);
      expect(response.headers()["cache-control"]).toContain("no-store");
      const payload = await response.json() as { items: Record<string, unknown>[] };
      expect(Object.keys(payload)).toEqual(["items"]);
      expect(payload.items).toHaveLength(allCities);
      expect(payload.items.length).toBeLessThanOrEqual(8);
      for (const item of payload.items) expect(Object.keys(item).sort()).toEqual(["name", "slug", "state"]);
      await expectCitySuggestions(page, input, "", allCities);

      const matchingResponse = citySuggestionsResponse(page, "haza");
      await input.pressSequentially("haza");
      expect((await matchingResponse).status()).toBe(200);
      await expectCitySuggestions(page, input, "haza", matchingCities);
      if (matchingCities) {
        const list = page.getByRole("listbox", { name: "City suggestions", exact: true });
        const option = list.getByRole("option", { name: "Hazaribag, Jharkhand", exact: true });
        await expect(option).toBeVisible();
        await input.press("ArrowDown");
        await expect(input).toHaveAttribute("aria-controls", `${entry.id}-suggestions`);
        await expect(input).toHaveAttribute("aria-activedescendant", `${entry.id}-suggestions-0`);
        await expect(option).toHaveAttribute("aria-selected", "true");
        await expect(input).toBeFocused();
        // Actionability catches an art layer or ancestor clipping the popup.
        await option.click({ trial: true });
        const bounds = await list.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right, width: element.clientWidth, content: element.scrollWidth, viewport: document.documentElement.clientWidth };
        });
        expect(bounds.left).toBeGreaterThanOrEqual(0);
        expect(bounds.right).toBeLessThanOrEqual(bounds.viewport + 1);
        expect(bounds.content).toBeLessThanOrEqual(bounds.width + 1);
        const target = await option.boundingBox();
        expect(target?.height).toBeGreaterThanOrEqual(44);
        expect(target?.width).toBeGreaterThanOrEqual(44);
      } else {
        await expect(form.getByText("Hazaribag", { exact: true })).toHaveCount(0);
      }
      await expect(form.getByRole("button", { name: entry.button, exact: true })).toBeVisible();
      await noOverflow(page);
      const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      expect(result.violations, JSON.stringify(result.violations, null, 2)).toEqual([]);
    }
    expect(privateRequests, "Public suggestions must not request a private catalog or authentication").toEqual([]);
  });

  test.describe("Pointer input", () => {
    test.use({ hasTouch: true });

    test("a pointer or touch selection opens the public city directly", { tag: "@interaction" }, async ({ page }) => {
      test.skip(scenario === "empty", "No public city exists to select in the empty scenario.");
      await visit(page, "/");
      const input = page.getByRole("combobox", { name: "Where are you celebrating?", exact: true });
      const response = citySuggestionsResponse(page, "haza");
      await input.fill("haza");
      expect((await response).status()).toBe(200);
      await expectCitySuggestions(page, input, "haza", 1);
      const navigations: string[] = [];
      page.on("framenavigated", (frame) => {
        if (frame === page.mainFrame()) navigations.push(new URL(frame.url()).pathname);
      });
      const option = page.getByRole("option", { name: "Hazaribag, Jharkhand", exact: true });
      if ((page.viewportSize()?.width ?? 1440) < 768) await option.tap();
      else await option.click();
      await expect(page).toHaveURL(`${ORIGIN}${CITY}`);
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Hazaribag");
      await expect(page.getByRole("note").filter({ hasText: "Local test fixtures — not real venues" })).toBeVisible();
      expect(navigations).toEqual([CITY]);
    });
  });

  test("arrows choose a highlighted city; unhighlighted Enter keeps native search", { tag: "@interaction" }, async ({ page }) => {
    test.skip(scenario === "empty", "Arrow selection requires an existing public city; empty GET behavior has separate coverage.");
    await visit(page, "/");
    const input = page.getByRole("combobox", { name: "Where are you celebrating?", exact: true });
    const firstResponse = citySuggestionsResponse(page, "");
    await input.focus();
    expect((await firstResponse).status()).toBe(200);
    await expectCitySuggestions(page, input, "", allCities);
    const options = page.getByRole("listbox", { name: "City suggestions", exact: true }).getByRole("option");
    await expect(options.first()).toHaveAccessibleName("Hazaribag, Jharkhand");
    await expect(page.getByRole("option", { selected: true })).toHaveCount(0);
    await input.press("ArrowDown");
    await expect(input).toHaveAttribute("aria-activedescendant", "home-city-search-suggestions-0");
    await input.press("ArrowUp");
    await expect(input).toHaveAttribute("aria-activedescendant", `home-city-search-suggestions-${allCities - 1}`);
    await expect(options.last()).toHaveAttribute("aria-selected", "true");
    await input.press("ArrowDown");
    await expect(options.first()).toHaveAttribute("aria-selected", "true");
    await expect(input).toBeFocused();
    await input.press("Enter");
    await expect(page).toHaveURL(`${ORIGIN}${CITY}`);

    await visit(page, "/cities");
    const directoryInput = page.getByRole("combobox", { name: "Search for a city", exact: true });
    const matchingResponse = citySuggestionsResponse(page, "haza");
    await directoryInput.fill("haza");
    expect((await matchingResponse).status()).toBe(200);
    await expectCitySuggestions(page, directoryInput, "haza", 1);
    await expect(page.getByRole("option", { selected: true })).toHaveCount(0);
    await directoryInput.press("Enter");
    await expect(page).toHaveURL((url) => url.pathname === "/cities" && url.searchParams.get("q") === "haza");
    await expect(page.getByRole("heading", { name: "City guides matching “haza”", exact: true })).toBeVisible();
    await expect(page.locator(".sh-city-card")).toHaveCount(1);
  });

  test("Escape and Tab dismiss suggestions without clearing or trapping focus", { tag: "@interaction" }, async ({ page }) => {
    await visit(page, "/");
    const input = page.getByRole("combobox", { name: "Where are you celebrating?", exact: true });
    const response = citySuggestionsResponse(page, "haza");
    await input.fill("haza");
    expect((await response).status()).toBe(200);
    await expectCitySuggestions(page, input, "haza", matchingCities);
    if (matchingCities) await input.press("ArrowDown");
    await input.press("Escape");
    await expect(input).toHaveValue("haza");
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute("aria-expanded", "false");
    await expect(input).not.toHaveAttribute("aria-activedescendant", /.+/);
    await expect(page.getByRole("listbox", { name: "City suggestions", exact: true })).toBeHidden();

    // Reopening and refocusing each require a fresh real request, not a query cache.
    const reopened = citySuggestionsResponse(page, "haza");
    await input.press("ArrowDown");
    expect((await reopened).status()).toBe(200);
    await expectCitySuggestions(page, input, "haza", matchingCities);
    await input.press("Tab");
    await expect(page.getByRole("button", { name: "Find my city", exact: true })).toBeFocused();
    await expect(input).toHaveValue("haza");
    await expect(input).toHaveAttribute("aria-expanded", "false");
    await expect(input).not.toHaveAttribute("aria-activedescendant", /.+/);
    await expect(page.getByRole("listbox", { name: "City suggestions", exact: true })).toBeHidden();
    const refocused = citySuggestionsResponse(page, "haza");
    await page.keyboard.press("Shift+Tab");
    expect((await refocused).status()).toBe(200);
    await expect(input).toBeFocused();
    await expectCitySuggestions(page, input, "haza", matchingCities);
  });

  test("late suggestions cannot survive spaces, clearing, Escape, blur or unmount", { tag: "@interaction" }, async ({ page }) => {
    for (const change of ["space", "clear", "escape", "blur", "unmount"] as const) {
      await test.step(change, async () => {
        await visit(page, "/");
        const input = page.getByRole("combobox", { name: "Where are you celebrating?", exact: true });
        const initialResponse = citySuggestionsResponse(page, "");
        await input.focus();
        expect((await initialResponse).status()).toBe(200);
        await expectCitySuggestions(page, input, "", allCities);
        const delayed = await holdCitySuggestions(page, "haza");
        try {
          await input.fill("haza");
          const held = await delayed.pending;
          expect(held.response.status()).toBe(200);
          await expect(page.locator(".sh-city-search-form").getByRole("status")).toHaveText("Searching public city guides…");
          await expect(page.getByRole("option")).toHaveCount(0);
          const request = held.request;
          // This deadline is below the UI request timeout: cancellation must
          // happen on the edit/dismissal itself, not eventually via timeout.
          const cancelled = page.waitForEvent("requestfailed", { predicate: (failed) => failed === request, timeout: 5_000 });
          if (change === "space" || change === "clear") {
            const query = change === "space" ? "haza " : "";
            const freshResponse = citySuggestionsResponse(page, query);
            await input.fill(query);
            await cancelled;
            expect((await freshResponse).status()).toBe(200);
            await expectCitySuggestions(page, input, query, change === "space" ? matchingCities : allCities);
          } else {
            if (change === "unmount") {
              // No pointerdown or blur: only component unmount can cancel this
              // pending fetch during the real client-side directory navigation.
              await page.getByRole("link", { name: "All city guides", exact: true }).dispatchEvent("click");
              await expect(page).toHaveURL(`${ORIGIN}/cities`);
            } else if (change === "escape") await input.press("Escape");
            else await page.getByRole("button", { name: "Find my city", exact: true }).focus();
            await cancelled;
          }
          expect(request.failure()?.errorText).toMatch(/aborted|cancelled/i);
          await delayed.release();
          if (change === "space" || change === "clear") {
            await expectCitySuggestions(page, input, change === "space" ? "haza " : "", change === "space" ? matchingCities : allCities);
          } else {
            const currentInput = change === "unmount" ? page.getByRole("combobox", { name: "Search for a city", exact: true }) : input;
            await expect(currentInput).toHaveValue(change === "unmount" ? "" : "haza");
            await expect(currentInput).toHaveAttribute("aria-expanded", "false");
            await expect(currentInput).toHaveAttribute("aria-busy", "false");
            await expect(currentInput).not.toHaveAttribute("aria-activedescendant", /.+/);
            await expect(page.getByRole("listbox", { name: "City suggestions", exact: true })).toBeHidden();
            await expect(page.locator(".sh-city-search-form").getByRole("status")).toHaveText("");
          }
        } finally {
          await delayed.remove();
        }
      });
    }
  });

  test("no matches, request errors and malformed responses stay distinct and retryable", { tag: "@interaction" }, async ({ page }) => {
    await visit(page, "/");
    const input = page.getByRole("combobox", { name: "Where are you celebrating?", exact: true });
    const form = page.locator(".sh-city-search-form");
    for (const status of [400, 503, 200]) {
      await test.step(status === 200 ? "invalid payload" : `HTTP ${status}`, async () => {
        const noMatch = citySuggestionsResponse(page, "nomatchfixture");
        await input.fill("nomatchfixture");
        expect((await noMatch).status()).toBe(200);
        await expectCitySuggestions(page, input, "nomatchfixture", 0);
        await expect(form.getByRole("button", { name: "Retry city suggestions", exact: true })).toHaveCount(0);
        // Only this new public endpoint is stubbed, and only for failure paths.
        await page.route(`${ORIGIN}${CITY_SUGGESTIONS}?q=haza`, (route) => route.fulfill({
          status, contentType: "application/json", headers: { "Cache-Control": "no-store" },
          body: JSON.stringify(status === 200 ? { items: null } : { error: "Local suggestion failure exercise." }),
        }), { times: 1 });
        const failed = citySuggestionsResponse(page, "haza");
        await input.fill("haza");
        expect((await failed).status()).toBe(status);
        await expect(form.getByRole("status")).toHaveText("City suggestions are unavailable. Try again or use the search button.");
        await expect(input).toHaveAttribute("aria-expanded", "false");
        await expect(input).toHaveAttribute("aria-busy", "false");
        await expect(page.getByRole("option")).toHaveCount(0);
        await expect(form.getByText("No public city guides match yet.", { exact: true })).toHaveCount(0);
        await expect(form.getByText("Local suggestion failure exercise.", { exact: true })).toHaveCount(0);
        const retry = form.getByRole("button", { name: "Retry city suggestions", exact: true });
        await expect(retry).toBeVisible();
        await input.press("Tab");
        await expect(form.getByRole("button", { name: "Find my city", exact: true })).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(retry).toBeFocused();
        const recovered = citySuggestionsResponse(page, "haza");
        await page.keyboard.press("Enter");
        expect((await recovered).status()).toBe(200);
        await expectCitySuggestions(page, input, "haza", matchingCities);
        await expect(input).toBeFocused();
        await expect(retry).toHaveCount(0);
      });
    }
  });

  test.describe("Without JavaScript", () => {
    test.use({ javaScriptEnabled: false });

    test("both city forms retain native GET submission without JavaScript", { tag: "@interaction" }, async ({ page }) => {
      const suggestionRequests: string[] = [];
      page.on("request", (request) => {
        if (new URL(request.url()).pathname === CITY_SUGGESTIONS) suggestionRequests.push(request.url());
      });
      await visit(page, "/");
      const homeInput = page.getByRole("combobox", { name: "Where are you celebrating?", exact: true });
      await expect(page.locator(".sh-city-search-form")).toHaveAttribute("action", "/cities");
      await expect(page.locator(".sh-city-search-form")).toHaveAttribute("method", "get");
      await homeInput.fill("haza");
      await homeInput.press("Enter");
      await expect(page).toHaveURL((url) => url.pathname === "/cities" && url.searchParams.get("q") === "haza");
      await expect(page.locator(".sh-city-card")).toHaveCount(matchingCities);
      const directoryInput = page.getByRole("combobox", { name: "Search for a city", exact: true });
      await expect(directoryInput).toHaveValue("haza");
      await expect(directoryInput).toHaveAttribute("aria-expanded", "false");
      await expect(page.locator(".sh-city-search-form")).toHaveAttribute("action", "/cities");
      await expect(page.locator(".sh-city-search-form")).toHaveAttribute("method", "get");
      await directoryInput.fill("nomatchfixture");
      await page.getByRole("button", { name: "Find a city", exact: true }).click();
      await expect(page).toHaveURL((url) => url.pathname === "/cities" && url.searchParams.get("q") === "nomatchfixture");
      await expect(page.getByRole("heading", { name: "No city guides match your search.", exact: true })).toBeVisible();
      await expect(page.locator(".sh-city-card")).toHaveCount(0);
      await expect(page.getByRole("note").filter({ hasText: "Local test fixtures — not real venues" })).toBeVisible();
      await noOverflow(page);
      expect(suggestionRequests, "Unenhanced native forms must not need a suggestions request").toEqual([]);
    });
  });
});

test.describe("Discovery with the many-record scenario", () => {
  test.skip(scenario !== "many", "This group requires the sixteen-record pagination/filter fixture.");

  test("city and venue searches use case-insensitive AND word prefixes", { tag: "@interaction" }, async ({ page }) => {
    await visit(page, "/");
    await page.getByRole("combobox", { name: "Where are you celebrating?" }).fill("HAZ JHA");
    await page.getByRole("button", { name: "Find my city" }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/cities" && url.searchParams.get("q") === "HAZ JHA");
    await expect(page.locator(".sh-city-card")).toHaveCount(1);
    await page.locator(".sh-city-card").getByRole("link").click();
    await expect(page).toHaveURL(`${ORIGIN}${CITY}`);
    await page.getByRole("searchbox", { name: "Find a venue in this city" }).fill("SyN gAl");
    await page.getByRole("search").getByRole("button", { name: "Search", exact: true }).click();
    await expect(venueNames(page)).toHaveText(["Synthetic Gallery Hall"]);
    await expect(page.getByRole("heading", { name: "1 venue found", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "View Synthetic Gallery Hall in Hazaribag", exact: true }).click();
    await expect(page).toHaveURL(`${ORIGIN}${GALLERY}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Synthetic Gallery Hall");

    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Search venues" }).click();
    await page.getByRole("searchbox", { name: "Search across city guides" }).fill("hAz jHa");
    await page.getByRole("search").getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("heading", { name: "16 venues found", exact: true })).toBeVisible();
    await expect(venueNames(page)).toHaveCount(12);
    await page.getByRole("searchbox", { name: "Search across city guides" }).fill("allery");
    await page.getByRole("search").getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("heading", { name: "No venues match your search." })).toBeVisible();
    await expect(venueNames(page)).toHaveCount(0);
    await page.getByRole("link", { name: "Clear search", exact: true }).click();
    await expect(page).toHaveURL(`${ORIGIN}/search`);
    await expect(venueNames(page)).toHaveCount(12);
  });

  test("search syntax is literal text rather than user-supplied OR operators", { tag: "@interaction" }, async ({ page }) => {
    await visit(page, "/search?q=Gallery%7CAmber");
    await expect(venueNames(page)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "No venues match your search." })).toBeVisible();
    await visit(page, "/search?q=Paper+Dis");
    await expect(page.getByRole("heading", { name: "15 venues found", exact: true })).toBeVisible();
    await expect(venueNames(page)).toHaveCount(12);
  });

  test("city and global pagination retain the search and show page two without duplicates", { tag: "@interaction" }, async ({ page }) => {
    for (const path of [CITY, "/search"]) {
      await visit(page, `${path}?q=Syn`);
      const firstPage = await venueNames(page).allTextContents();
      expect(firstPage).toHaveLength(12);
      await page.getByRole("navigation", { name: "Results pages" }).getByRole("link", { name: "Next", exact: true }).click();
      await expect(page).toHaveURL((url) => url.pathname === path && url.searchParams.get("page") === "2" && url.searchParams.get("q") === "Syn");
      await expect(venueNames(page)).toHaveText(["Synthetic Kite Hall", "Synthetic Linen Hall", "Synthetic Mosaic Court", "Synthetic Ochre Hall"]);
      const secondPage = await venueNames(page).allTextContents();
      expect(new Set([...firstPage, ...secondPage]).size).toBe(16);
      const pagination = page.getByRole("navigation", { name: "Results pages" });
      await expect(pagination.getByRole("link", { name: "Page 2", exact: true })).toHaveAttribute("aria-current", "page");
      await expect(pagination.getByRole("link", { name: "Next", exact: true })).toHaveCount(0);
      await pagination.getByRole("link", { name: "Previous", exact: true }).click();
      await expect(page).toHaveURL((url) => url.pathname === path && !url.searchParams.has("page") && url.searchParams.get("q") === "Syn");
      await expect(venueNames(page)).toHaveText(firstPage);
    }
  });

  test("filters combine type, capacity, basis, budget and ALL facilities and reset pagination", { tag: "@interaction" }, async ({ page }) => {
    await visit(page, `${CITY}?q=Syn&page=2`);
    const filters = await openFilters(page);
    await filters.getByLabel("Venue type", { exact: true }).selectOption("vivah_bhawan");
    await filters.getByLabel("Guest count", { exact: true }).fill("400");
    await filters.getByLabel("Price basis", { exact: true }).selectOption("per_day");
    await filters.getByLabel("Maximum budget (₹)", { exact: true }).fill("25000");
    await filters.getByRole("checkbox", { name: "Air conditioning", exact: true }).check();
    await filters.getByRole("checkbox", { name: "Parking", exact: true }).check();
    await filters.getByRole("button", { name: "Apply filters", exact: true }).click();
    await expect(venueNames(page)).toHaveText(["Synthetic Gallery Hall", "Synthetic Indigo Hall"]);
    const query = new URL(page.url()).searchParams;
    expect(query.get("q")).toBe("Syn");
    expect(query.has("page")).toBe(false);
    expect(query.get("type")).toBe("vivah_bhawan");
    expect(query.get("capacity")).toBe("400");
    expect(query.get("priceType")).toBe("per_day");
    expect(query.get("budget")).toBe("25000");
    expect(query.getAll("facility")).toEqual(["ac", "parking"]);
    await expect(page.getByRole("dialog", { name: "Refine your search" })).toBeHidden();

    await page.getByLabel("Sort by", { exact: true }).selectOption("price");
    await page.getByRole("button", { name: "Apply sort", exact: true }).click();
    await expect(venueNames(page)).toHaveText(["Synthetic Indigo Hall", "Synthetic Gallery Hall"]);
    expect(new URL(page.url()).searchParams.getAll("facility")).toEqual(["ac", "parking"]);
    await page.getByRole("navigation", { name: "Active search filters" })
      .getByRole("link", { name: "Remove filter: Prices per day", exact: true }).click();
    await expect(page.getByLabel("Sort by", { exact: true })).toHaveValue("recent");
    const withoutBasis = new URL(page.url()).searchParams;
    for (const key of ["budget", "priceType", "sort", "page"]) expect(withoutBasis.has(key), key).toBe(false);
    expect(withoutBasis.get("q")).toBe("Syn");
    expect(withoutBasis.getAll("facility")).toEqual(["ac", "parking"]);
    await page.getByRole("navigation", { name: "Active search filters" }).getByRole("link", { name: "Reset all", exact: true }).click();
    await expect(page).toHaveURL(`${ORIGIN}${CITY}`);
    await expect(page.getByRole("heading", { name: "16 venues to explore", exact: true })).toBeVisible();
  });

  test("budgets use the recorded starting price or an upper-bound-only price on the selected basis", { tag: "@interaction" }, async ({ page }) => {
    const examples = [
      { basis: "per_day", budget: 9000, names: ["Synthetic Dune Hall", "Synthetic Kite Hall"], label: "per day" },
      { basis: "per_event", budget: 25000, names: ["Synthetic Jade Pavilion"], label: "per event" },
      { basis: "per_plate", budget: 1200, names: ["Synthetic Linen Hall", "Synthetic Elm Pavilion"], label: "per plate" },
    ];
    for (const example of examples) {
      await visit(page, `${CITY}?sort=price&budget=${example.budget}&priceType=${example.basis}`);
      await expect(venueNames(page)).toHaveText(example.names);
      for (const price of await page.locator(".sh-card-price").allTextContents()) expect(price).toContain(example.label);
      await noInventedMissingValues(page);
    }
  });

  test("budget and price sort without a basis are not silently compared", { tag: "@interaction" }, async ({ page }) => {
    await visit(page, `${CITY}?sort=price&budget=9000`);
    await expect(page.getByRole("status").filter({ hasText: "Choose a price basis to apply a budget or sort by price." })).toBeVisible();
    await expect(page.getByLabel("Sort by", { exact: true })).toHaveValue("recent");
    await expect(page.getByLabel("Sort by", { exact: true }).locator('option[value="price"]')).toBeDisabled();
    await expect(page.getByRole("heading", { name: "16 venues to explore", exact: true })).toBeVisible();
    await expect(venueNames(page)).toHaveCount(12);
    await expect(page.getByRole("navigation", { name: "Active search filters" })).toHaveCount(0);
  });

  test("name and capacity sorts are stable, reset the page, and leave unrecorded maxima last", { tag: "@interaction" }, async ({ page }) => {
    await visit(page, `${CITY}?page=2`);
    await page.getByLabel("Sort by", { exact: true }).selectOption("name");
    await page.getByRole("button", { name: "Apply sort", exact: true }).click();
    await expect(venueNames(page).first()).toHaveText("Synthetic Amber Hall");
    const names = await venueNames(page).allTextContents();
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
    expect(new URL(page.url()).searchParams.has("page")).toBe(false);
    await page.getByLabel("Sort by", { exact: true }).selectOption("capacity");
    await page.getByRole("button", { name: "Apply sort", exact: true }).click();
    await expect(venueNames(page).first()).toHaveText("Synthetic Kite Hall");
    expect((await venueNames(page).allTextContents()).slice(0, 5)).toEqual([
      "Synthetic Kite Hall", "Synthetic Dune Hall", "Synthetic Amber Hall", "Synthetic Jade Pavilion", "Synthetic Indigo Hall",
    ]);
    await page.getByRole("navigation", { name: "Results pages" }).getByRole("link", { name: "Next", exact: true }).click();
    await expect(venueNames(page)).toHaveText(["Synthetic Ochre Hall", "Synthetic Garnet Hall", "Synthetic Minimal Hall", "Synthetic Linen Hall"]);
    expect(new URL(page.url()).searchParams.get("sort")).toBe("capacity");
  });

  test("empty inventory, no matching filters, and an out-of-range page remain distinct", { tag: "@interaction" }, async ({ page }) => {
    await visit(page, EMPTY_CITY);
    await expect(page.getByRole("heading", { name: "The first places are still taking shape." })).toBeVisible();
    await expect(venueNames(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Filters/ })).toHaveCount(0);
    await expect(page.getByLabel("Sort by", { exact: true })).toHaveCount(0);

    await visit(page, `${CITY}?capacity=99999`);
    await expect(page.getByRole("heading", { name: "No places match just yet." })).toBeVisible();
    await expect(venueNames(page)).toHaveCount(0);
    await page.getByRole("link", { name: "Reset search & filters", exact: true }).click();
    await expect(venueNames(page)).toHaveCount(12);

    await visit(page, `${CITY}?q=Syn&sort=name&page=999`);
    await expect(page.getByRole("heading", { name: "There are no venues on this page." })).toBeVisible();
    await expect(venueNames(page)).toHaveCount(0);
    await page.getByRole("link", { name: "Go to the first page", exact: true }).click();
    await expect(page).toHaveURL((url) => url.pathname === CITY && !url.searchParams.has("page") && url.searchParams.get("q") === "Syn" && url.searchParams.get("sort") === "name");
    await expect(venueNames(page)).toHaveCount(12);
  });

  test("minimal listing omits optional facts, contacts and photographs honestly", { tag: "@interaction" }, async ({ page }) => {
    await visit(page, MINIMAL);
    const detail = page.locator(".sh-venue-detail");
    await expect(detail.locator(".sh-detail-facts, .sh-contact-price, .sh-checked, img")).toHaveCount(0);
    await expect(detail.locator('a[href^="tel:"], a[href^="mailto:"], a[href*="wa.me"], a[href*="google.com/maps"]')).toHaveCount(0);
    await expect(detail.getByRole("img", { name: "Venue photograph not available. Decorative illustration, not a venue photograph.", exact: true })).toBeVisible();
    await expect(detail.getByText("Facilities have not been recorded for this listing yet. Ask the venue about the essentials for your event.", { exact: true })).toBeVisible();
    await expect(detail.getByText("Contact information has not been published for this venue yet. There is no sign-up or hidden contact form.", { exact: true })).toBeVisible();
    await noInventedMissingValues(page);
  });
});

test("mobile filter drawer contains focus, closes on Escape, and restores its trigger", { tag: ["@interaction", "@a11y"] }, async ({ page }) => {
  test.skip(scenario === "empty", "An empty fixture scenario has no venue filters.");
  test.skip((page.viewportSize()?.width ?? 1440) >= 992, "Desktop uses the persistent filter panel.");
  await visit(page, CITY);
  const before = await page.locator("body").evaluate((element) => element.style.overflow);
  const trigger = page.getByRole("button", { name: /^Filters/ });
  const dialog = await openFilters(page);
  await focusStaysInDialog(page, dialog);
  await noOverflow(page);
  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, JSON.stringify(result.violations, null, 2)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect.poll(() => page.locator("body").evaluate((element) => element.style.overflow)).toBe(before);

  await trigger.click();
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Price basis", { exact: true }).selectOption("per_day");
  await dialog.getByLabel("Maximum budget (₹)", { exact: true }).fill("9000");
  await dialog.getByLabel("Price basis", { exact: true }).selectOption("");
  await expect(dialog.getByLabel("Maximum budget (₹)", { exact: true })).toHaveValue("");
  await dialog.getByRole("button", { name: "Close filters" }).click();
  await expect(trigger).toBeFocused();
});

test.describe("Synthetic diagram gallery", () => {
  test.skip(scenario === "empty", "The empty scenario deliberately exposes no fixture photos.");

  test("an image that fails before hydration still gets a fallback without hiding a healthy image", { tag: "@interaction" }, async ({ page }) => {
    const releaseScripts = Promise.withResolvers<void>();
    const scriptsHeld = Promise.withResolvers<void>();
    const scripts = new RegExp(`^${ORIGIN}/_next/static/.*\\.js(?:\\?.*)?$`);
    const holdScripts = async (route: Route) => {
      scriptsHeld.resolve();
      await releaseScripts.promise;
      await route.continue();
    };
    await page.addInitScript((photoId: string) => {
      document.addEventListener("error", (event) => {
        const image = event.target;
        if (image instanceof HTMLImageElement && image.getAttribute("src")?.includes(`/media/${photoId}/`)) {
          Reflect.set(window, "__shagunQaNativeImageFailure", {
            complete: image.complete, naturalWidth: image.naturalWidth, currentSrc: image.currentSrc,
          });
        }
      }, true);
    }, FIRST_PHOTO);
    await page.route(scripts, holdScripts);
    await page.route(new RegExp(`^${ORIGIN}/media/${FIRST_PHOTO}/(480|960|1600)(?:\\?.*)?$`), (route) => route.fulfill({
      status: 404, contentType: "text/plain", body: "Synthetic image failed before hydration.",
    }));
    try {
      const response = await page.goto(GALLERY, { waitUntil: "commit" });
      expect(response?.status()).toBe(200);
      await scriptsHeld.promise;
      await expect.poll(() => page.evaluate(() => Reflect.get(window, "__shagunQaNativeImageFailure"))).toMatchObject({ complete: true, naturalWidth: 0 });
      const first = page.locator(".sh-gallery-item").first();
      await expect(first.locator("img")).toHaveCount(1);
      // Native image failure is established while hydration code cannot execute.
      await expect(first.locator(".sh-photo-fallback")).toHaveCount(0);
      releaseScripts.resolve();
      await expect(first.getByRole("img", { name: "Venue photograph not available. Decorative illustration, not a venue photograph.", exact: true })).toBeVisible();
      const next = page.locator(".sh-gallery-item").nth(1).getByRole("img");
      await loadedImage(next);
      await expect(page.getByRole("note").filter({ hasText: "Local test fixtures — not real venues" })).toBeVisible();
      await noOverflow(page);
    } finally {
      releaseScripts.resolve();
      await page.unroute(scripts, holdScripts);
    }
  });

  test("six diagrams load; arrows wrap, focus stays modal, and Escape restores the exact opener", { tag: ["@interaction", "@a11y"] }, async ({ page }) => {
    await visit(page, GALLERY);
    await expect(page.locator(".sh-gallery-item")).toHaveCount(6);
    await loadedImage(page.getByRole("img", { name: "Synthetic test-card diagram 1 of 6. Not a venue photograph.", exact: true }));
    await expect(page.locator('.sh-venue-detail a[href^="tel:"], .sh-venue-detail a[href*="wa.me"], .sh-venue-detail a[href*="google.com/maps"]')).toHaveCount(0);
    const opener = page.getByRole("link", { name: /^Open photo 1 of 6:/ });
    const before = await page.locator("body").evaluate((element) => element.style.overflow);
    await opener.click();
    const dialog = page.getByRole("dialog", { name: /Synthetic Gallery Hall.*photographs/ });
    await expect(dialog).toBeVisible();
    const close = dialog.getByRole("button", { name: "Close photo gallery" });
    await expect(close).toBeFocused();
    await expect(dialog.locator('[aria-live="polite"]')).toHaveText(/Photo 1\s+of 6/);
    await focusStaysInDialog(page, dialog);

    await page.keyboard.press("ArrowRight");
    await expect(dialog.locator('[aria-live="polite"]')).toHaveText(/Photo 2\s+of 6/);
    await loadedImage(dialog.getByRole("img", { name: "Synthetic test-card diagram 2 of 6. Not a venue photograph.", exact: true }));
    await page.keyboard.press("ArrowLeft");
    await expect(dialog.locator('[aria-live="polite"]')).toHaveText(/Photo 1\s+of 6/);
    await page.keyboard.press("ArrowLeft");
    await expect(dialog.locator('[aria-live="polite"]')).toHaveText(/Photo 6\s+of 6/);
    await loadedImage(dialog.getByRole("img", { name: "Synthetic test-card diagram 6 of 6. Not a venue photograph.", exact: true }));
    await dialog.getByRole("button", { name: "Next photograph" }).click();
    await expect(dialog.locator('[aria-live="polite"]')).toHaveText(/Photo 1\s+of 6/);
    await noOverflow(page);
    const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(result.violations, JSON.stringify(result.violations, null, 2)).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
    await expect.poll(() => page.locator("body").evaluate((element) => element.style.overflow)).toBe(before);

    const all = page.getByRole("link", { name: "View all photographs", exact: true });
    await all.click();
    await expect(dialog).toBeVisible();
    await close.click();
    await expect(all).toBeFocused();
  });

  test("a missing public image shows the labelled fallback and the next diagram still loads", { tag: "@interaction" }, async ({ page }) => {
    // A public synthetic image error; like suggestion failure/delay stubs above, never admin or auth.
    await page.route(new RegExp(`^http://localhost:3100/media/${FIRST_PHOTO}/(480|960|1600)(?:\\?.*)?$`), (route) => route.fulfill({
      status: 404, contentType: "text/plain", body: "Synthetic missing-image browser test.",
    }));
    await visit(page, GALLERY);
    const first = page.locator(".sh-gallery-item").first();
    await expect(first.getByRole("img", { name: "Venue photograph not available. Decorative illustration, not a venue photograph.", exact: true })).toBeVisible();
    await first.getByRole("link").click();
    const dialog = page.getByRole("dialog", { name: /Synthetic Gallery Hall.*photographs/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("img", { name: /Venue photograph not available/ })).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await loadedImage(dialog.getByRole("img", { name: "Synthetic test-card diagram 2 of 6. Not a venue photograph.", exact: true }));
    await page.keyboard.press("Escape");
    await expect(first.getByRole("link")).toBeFocused();
    await noOverflow(page);
  });
});