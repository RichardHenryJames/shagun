import { expect, test as base, type APIResponse, type Page } from "@playwright/test";
import sharp from "sharp";

// These checks cover the local, unconfigured application's anonymous boundaries only.
// They do NOT establish live Supabase authentication, RLS, uploads, or storage coverage.
const ORIGIN = "http://localhost:3100";
const scenario = process.env.SHAGUN_FIXTURE_SCENARIO ?? "many";
const CITY_ID = "10000000-0000-4000-8000-000000000001";
const VENUE_ID = "20000000-0000-4000-8000-000000000001";
const PHOTO_IDS = Array.from({ length: 6 }, (_, index) => `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
const MISSING_PHOTO = "30000000-0000-4000-8000-000000000099";
const CITY = "/city/hazaribag";
const GALLERY = `${CITY}/vivah-bhawan/synthetic-gallery-hall`;
const MINIMAL = `${CITY}/vivah-bhawan/synthetic-minimal-hall`;
const sameOrigin = { Origin: ORIGIN, "Sec-Fetch-Site": "same-origin" };

const test = base.extend({
  context: async ({ context }, run) => {
    const external: string[] = [];
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (["http:", "https:"].includes(url.protocol) && url.origin !== ORIGIN) {
        external.push(url.href);
        return route.abort("blockedbyclient");
      }
      return route.continue();
    });
    await run(context);
    expect.soft(external, "Metadata and admin navigation must not contact external services").toEqual([]);
  },
});

async function publicPage(page: Page, path: string): Promise<void> {
  const response = await page.goto(path);
  expect(response?.status(), path).toBe(200);
  await expect(page.getByRole("note").filter({ hasText: "Local test fixtures — not real venues" })).toBeVisible();
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("h1")).not.toHaveText("Finding the details.");
}

async function jsonLd(page: Page): Promise<Record<string, unknown>[]> {
  const documents: Record<string, unknown>[] = [];
  for (const text of await page.locator('script[type="application/ld+json"]').allTextContents()) {
    const parsed: unknown = JSON.parse(text);
    for (const entry of Array.isArray(parsed) ? parsed : [parsed]) {
      expect(entry).not.toBeNull();
      expect(typeof entry).toBe("object");
      expect(Array.isArray(entry)).toBe(false);
      documents.push(entry as Record<string, unknown>);
    }
  }
  return documents;
}

async function authenticationDenied(response: APIResponse): Promise<void> {
  // Do not accept 400/404/405/500/503 as proof that authentication was enforced.
  // Also do not follow a redirect to a 200 login page and call it an API denial.
  expect([401, 403], `Expected an authentication denial, received HTTP ${response.status()}`).toContain(response.status());
  expect(response.headers()["location"]).toBeUndefined();
  expect(response.headers()["cache-control"]).toMatch(/no-store/i);
  expect(response.headers()["content-type"]).toMatch(/application\/json/i);
  const payload: unknown = await response.json();
  expect(payload).toMatchObject({ error: expect.any(String) });
  expect(payload).not.toHaveProperty("photo");
  expect(payload).not.toHaveProperty("photos");
  const message = (payload as { error: string }).error;
  expect(message).not.toMatch(/origin|csrf/i);
  expect(message).not.toContain("Synthetic Gallery Hall");
}

test.describe("Local HTTP, metadata and anonymous access", { tag: "@http" }, () => {
  const canonicalPaths = ["/", "/cities", "/cities?q=Haz", "/search?q=Syn", "/about", "/privacy"];
  if (scenario !== "empty") canonicalPaths.push(CITY, GALLERY);
  if (scenario === "many") canonicalPaths.push(
    `${CITY}?page=2`, `${CITY}?sort=price&budget=9000&priceType=per_day`,
    "/city/synthetic-empty-city", MINIMAL,
  );

  for (const path of canonicalPaths) {
    test(`${path}: canonical and social URLs use the build-time local origin; fixtures are noindex`, async ({ page }) => {
      await publicPage(page, path);
      await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
      // Next normalizes the root origin without a trailing slash; these URLs are identical.
      const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
      const social = await page.locator('meta[property="og:url"]').getAttribute("content");
      expect(new URL(canonical!).href).toBe(new URL(`${ORIGIN}${path}`).href);
      expect(new URL(social!).href).toBe(new URL(`${ORIGIN}${path}`).href);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /\bnoindex\b/);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /\S/);
      await expect(page).toHaveTitle(/Shagun/);
    });
  }

  test("venue JSON-LD describes synthetic records without invented contacts, ratings or maps", async ({ page }) => {
    test.skip(scenario === "empty", "No venue exists in the empty scenario.");
    await publicPage(page, GALLERY);
    const documents = await jsonLd(page);
    expect(documents.some((document) => document["@type"] === "BreadcrumbList")).toBe(true);
    const venue = documents.find((document) => document["@type"] === "EventVenue");
    expect(venue).toMatchObject({
      "@context": "https://schema.org", "@type": "EventVenue", "@id": `${ORIGIN}${GALLERY}#venue`,
      name: "Synthetic Gallery Hall", url: `${ORIGIN}${GALLERY}`, maximumAttendeeCapacity: 600,
      description: expect.stringContaining("SYNTHETIC LOCAL TEST FIXTURE"),
      image: PHOTO_IDS.map((id) => `${ORIGIN}/media/${id}/1600`),
    });
    for (const property of ["telephone", "email", "geo", "aggregateRating", "review", "offers"]) {
      expect(venue).not.toHaveProperty(property);
    }
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", `${ORIGIN}/media/${PHOTO_IDS[0]}/1600`);
    await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute("content", /Synthetic.*Not a venue photograph/);
  });

  test("minimal venue JSON-LD omits unrecorded optional properties instead of sentinel values", async ({ page }) => {
    test.skip(scenario !== "many", "The minimal venue belongs to the many-record scenario.");
    await publicPage(page, MINIMAL);
    const venue = (await jsonLd(page)).find((document) => document["@type"] === "EventVenue");
    expect(venue).toMatchObject({ "@type": "EventVenue", name: "Synthetic Minimal Hall", url: `${ORIGIN}${MINIMAL}` });
    for (const property of ["description", "telephone", "email", "geo", "image", "maximumAttendeeCapacity", "amenityFeature", "aggregateRating", "review", "offers", "address.streetAddress"]) {
      expect(venue).not.toHaveProperty(property);
    }
  });

  test("page-two JSON-LD preserves total count and absolute list positions", async ({ page }) => {
    test.skip(scenario !== "many", "Requires at least two result pages.");
    await publicPage(page, `${CITY}?page=2`);
    const list = (await jsonLd(page)).find((document) => document["@type"] === "ItemList");
    const expected = [
      ["Synthetic Kite Hall", "synthetic-kite-hall"],
      ["Synthetic Linen Hall", "synthetic-linen-hall"],
      ["Synthetic Mosaic Court", "synthetic-mosaic-court"],
      ["Synthetic Ochre Hall", "synthetic-ochre-hall"],
    ];
    expect(list).toMatchObject({
      "@type": "ItemList", numberOfItems: 16,
      itemListElement: expected.map(([name, slug], index) => ({
        "@type": "ListItem", name, position: index + 13, url: `${ORIGIN}${CITY}/vivah-bhawan/${slug}`,
      })),
    });
  });

  test("robots disallows crawling the local fixture deployment", async ({ request }) => {
    const response = await request.get("/robots.txt", { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    const text = await response.text();
    expect(text).toMatch(/^User-Agent:\s*\*\s*$/im);
    expect(text).toMatch(/^Disallow:\s*\/\s*$/im);
    expect(text).not.toMatch(/^Sitemap:/im);
  });

  test("original SVG assets exist and contain no external media or executable content", async ({ request }) => {
    for (const path of ["/celebration-arch.svg", "/favicon.svg"]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(200);
      expect(response.headers()["content-type"]).toMatch(/^image\/svg\+xml\b/i);
      const svg = await response.text();
      expect(svg).toContain("<svg");
      expect(svg).toMatch(/not a venue photograph/i);
      expect(svg).not.toMatch(/<script\b|<foreignObject\b|(?:href|src)\s*=\s*["']\s*(?:https?:|\/\/)/i);
    }
  });

  test("all six exact fixture media IDs return correctly sized WebP diagrams at every allowed width", async ({ request }) => {
    test.skip(scenario === "empty", "No media is exposed by the empty scenario.");
    for (const id of PHOTO_IDS) {
      for (const width of [480, 960, 1600]) {
        const response = await request.get(`/media/${id}/${width}`, { maxRedirects: 0 });
        expect(response.status(), `${id}/${width}`).toBe(200);
        expect(response.headers()["content-type"]).toMatch(/^image\/webp\b/i);
        const metadata = await sharp(await response.body()).metadata();
        expect(metadata.format).toBe("webp");
        expect(metadata.width).toBe(width);
        expect(metadata.height).toBe(width * 1000 / 1600);
        expect(metadata.exif).toBeUndefined();
      }
    }
  });

  test("unknown media IDs and invalid variants are 404, never arbitrary files or generated fallback data", async ({ request }) => {
    const paths = [
      `/media/${MISSING_PHOTO}/960`, "/media/not-a-uuid/480", "/media/toString/480",
      `/media/${PHOTO_IDS[0]}/481`, `/media/${PHOTO_IDS[0]}/0`, `/media/${PHOTO_IDS[0]}/1601`,
      `/media/${PHOTO_IDS[0]}/960.webp`, `/media/${PHOTO_IDS[0]}/960/extra`,
    ];
    if (scenario === "empty") paths.push(`/media/${PHOTO_IDS[0]}/480`);
    for (const path of paths) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(404);
      expect(response.headers()["content-type"] ?? "").not.toMatch(/^image\//i);
    }
  });

  const missingPages = [
    "/synthetic-missing-route", "/city/synthetic-missing-city", "/city/invalid_slug",
    `${CITY}/vivah-bhawan/synthetic-missing-hall`, `${CITY}/vivah-bhawan/invalid_slug`,
    "/city/synthetic-empty-city/vivah-bhawan/synthetic-gallery-hall", `${GALLERY}/extra`,
  ];
  for (const path of missingPages) {
    test(`${path}: actual 404 status, accessible recovery and noindex`, async ({ page }) => {
      // Deliberately require real HTTP 404, not merely a 200 page displaying the word "404".
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(/This place isn’t\s*on the page\./);
      await expect(page.getByRole("link", { name: "Explore city guides", exact: true })).toBeVisible();
      // A streamed 404 may add a second robots tag; require an attached noindex directive.
      await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
    });
  }

  const privatePages = [
    "/admin", "/admin/cities", "/admin/cities/new", `/admin/cities/${CITY_ID}`, `/admin/cities/${CITY_ID}/edit`,
    "/admin/venues", "/admin/venues/new", `/admin/venues/${VENUE_ID}`, `/admin/venues/${VENUE_ID}/preview`,
  ];
  for (const path of privatePages) {
    test(`${path}: deep anonymous access reaches the real unconfigured login`, async ({ page }) => {
      const response = await page.goto(path);
      await expect(page).toHaveURL(`${ORIGIN}/admin/login`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Connect Supabase to continue");
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator('input[type="password"], input[type="email"]')).toHaveCount(0);
      expect(response?.headers()["cache-control"]).toMatch(/no-store/i);
      expect(response?.headers()["x-robots-tag"]).toMatch(/noindex/i);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex.*nofollow/);
      await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
    });
  }

  test("anonymous POST upload is denied even with a valid origin and a synthetic WebP body", async ({ request }) => {
    // An original in-memory test card, never a real photograph or an attempted service connection.
    const image = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300"><rect width="480" height="300" fill="#faf7f2"/><g fill="#241d24" text-anchor="middle" font-family="sans-serif"><text x="240" y="130" font-size="25">SYNTHETIC TEST IMAGE</text><text x="240" y="180" font-size="20">Not a venue photograph</text></g></svg>')).webp().toBuffer();
    const response = await request.post("/api/admin/media", {
      headers: sameOrigin, maxRedirects: 0,
      multipart: {
        venue_id: VENUE_ID,
        alt_text: "Synthetic authentication test card. Not a venue photograph.",
        credit: "Original synthetic local QA diagram; not a venue photograph.",
        file: { name: "synthetic-test-card.webp", mimeType: "image/webp", buffer: image },
      },
    });
    await authenticationDenied(response);
  });

  test("anonymous PATCH metadata is denied with a valid origin", async ({ request }) => {
    const response = await request.patch(`/api/admin/media/${PHOTO_IDS[0]}`, {
      headers: sameOrigin, maxRedirects: 0,
      data: { operation: "metadata", alt_text: "Synthetic test diagram. Not a venue photograph.", credit: "Original synthetic diagram for local browser QA." },
    });
    await authenticationDenied(response);
  });

  test("anonymous DELETE is denied with a valid origin", async ({ request }) => {
    const response = await request.delete(`/api/admin/media/${PHOTO_IDS[0]}`, { headers: sameOrigin, maxRedirects: 0 });
    await authenticationDenied(response);
  });

  test("public fixture media IDs do not grant access to private admin previews", async ({ request }) => {
    const response = await request.get(`/api/admin/media/${PHOTO_IDS[0]}?w=480`, { headers: sameOrigin, maxRedirects: 0 });
    await authenticationDenied(response);
  });
});