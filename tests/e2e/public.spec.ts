import AxeBuilder from "@axe-core/playwright";
import { expect, test as base, type Locator, type Page } from "@playwright/test";

// Deliberately do not import server-only fixtures into the browser runner or replace app auth.
const ORIGIN = "http://localhost:3100";
const scenario = process.env.SHAGUN_FIXTURE_SCENARIO ?? "many";
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

test.describe("Discovery with the many-record scenario", () => {
  test.skip(scenario !== "many", "This group requires the sixteen-record pagination/filter fixture.");

  test("city and venue searches use case-insensitive AND word prefixes", { tag: "@interaction" }, async ({ page }) => {
    await visit(page, "/");
    await page.getByRole("searchbox", { name: "Where are you celebrating?" }).fill("HAZ JHA");
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
    // The ONLY response stub in this suite: a public synthetic image error, never admin or auth.
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