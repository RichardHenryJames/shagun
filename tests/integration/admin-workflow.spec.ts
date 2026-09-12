import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { expect, test, type Locator, type Page, type Response } from "@playwright/test";
import {
  ADMIN_COOKIE, CITY_PATH, CITY_WORKSPACE, IMAGE_BYTES_LIMIT, INTEGRATION_ORIGIN, MEDIA_BUCKET, SAME_ORIGIN,
  assertDenied, assertFreshInventory, assertImageResponse, assertLoginBudget, assertLoginRejected, assertPreview,
  assertRunConfiguration, assertSignedOut, assertStoredVariants, assertWorkspaceCounts, auditLayout, browserSession, checked,
  cleanupOwned, deleteFromUI, editor, field, generatedImages, integrationEnvironment, isolatedContext, loadedImage, localClients, login,
  newInventory, openFilters, publicSafety, record, runOwnedStorageCleanup, saveExisting, savedId, setCityStatus, setVenueStatus,
  submitEditor, uploadPhoto, visitPublic, type GeneratedImage, type LocalClient, type OwnedInventory,
} from "./fixtures";

// These are synthetic records created THROUGH the real UI in a disposable local
// database, not SHAGUN_TEST_FIXTURES, real venue research, or a production probe.
// No email/password/JWT/provider body, screenshot, trace or storageState is saved.
// Parent owns all setup/reset/build commands and accounts; tests never provision.
const API = { maxRedirects: 0, timeout: 10_000 };
const UUID_PATH = /^\/admin\/venues\/([0-9a-f-]{36})$/;
const savedPhotos = (page: Page) => page.getByRole("list", { name: "Saved photos in display order", exact: true });
const venueNames = (page: Page) => page.locator(".sh-venue-card h3");
const photoCard = (page: Page, id: string) => savedPhotos(page).getByRole("listitem")
  .filter({ has: page.locator(`img[src="/api/admin/media/${id}?w=480"]`) });

async function publicSitemap(client: LocalClient, paths: string[], safe: (body: string) => void): Promise<void> {
  // Read-only production sitemap RPC, with the anonymous key and no inline key
  // literals. HTTP on localhost is deliberately NOT evidence of indexability.
  const result = record(checked(await client.rpc("sitemap_entries", { p_offset: 0, p_limit: 100 }), "Anonymous sitemap eligibility"));
  safe(JSON.stringify(result));
  if (!Array.isArray(result.items)) throw new Error("The sitemap RPC did not return an items array.");
  expect(result.total).toBe(paths.length);
  expect(result.items.map((item: unknown) => record(item).path).sort()).toEqual([...paths].sort());
  expect(result.items.every((item: unknown) => typeof record(item).updatedAt === "string")).toBe(true);
}

async function publicCitySuggestions(page: Page, query: string, visible: boolean, safe: (body: string) => void): Promise<void> {
  const response = await page.request.get(`/api/cities/suggestions?${new URLSearchParams({ q: query })}`, API);
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(response.headers()["x-robots-tag"]).toMatch(/noindex/);
  expect(response.headers()["set-cookie"]).toBeUndefined();
  const body: unknown = await response.json();
  safe(JSON.stringify(body));
  expect(body).toEqual({ items: visible ? [{ name: "Chapra", slug: "chapra", state: "Bihar" }] : [] });
}

async function mutation(page: Page, id: string, button: Locator, method: "PATCH" | "DELETE" = "PATCH"): Promise<void> {
  const [response] = await Promise.all([
    page.waitForResponse((value) => value.url() === `${INTEGRATION_ORIGIN}/api/admin/media/${id}` && value.request().method() === method),
    button.click(),
  ]);
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toMatch(/no-store/i);
}

async function invalidUploads(page: Page, owned: OwnedInventory, image: GeneratedImage): Promise<void> {
  const cases = [
    {
      name: "synthetic-rejected.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'),
      ui: "Only JPEG, PNG and WebP files are accepted. SVG and animated formats are not supported.",
      status: 415, api: "Choose a JPEG, PNG or WebP file.",
    },
    {
      name: "synthetic-too-large.png", mimeType: "image/png",
      buffer: Buffer.concat([image.buffer, Buffer.alloc(IMAGE_BYTES_LIMIT + 1 - image.buffer.length)]),
      ui: "This file exceeds the 3 MB limit. Choose a smaller image.",
      status: 413, api: "Choose a nonempty image up to 3 MB.",
    },
  ];
  const section = page.getByRole("region", { name: "Venue photos", exact: true });
  for (const invalid of cases) {
    const file = { name: invalid.name, mimeType: invalid.mimeType, buffer: invalid.buffer };
    await field(section, "Choose images").setInputFiles(file);
    await expect(section.getByRole("alert")).toHaveText(invalid.ui);
    await expect(section.getByRole("button", { name: "Upload photos", exact: true })).toBeDisabled();
    await section.getByRole("button", { name: `Remove ${invalid.name} from upload queue`, exact: true }).click();
    // Bypass ONLY client file validation to exercise the actual authorized
    // endpoint's rejection. The same real browser session/Origin is retained.
    const response = await page.request.post("/api/admin/media", {
      ...API, headers: SAME_ORIGIN,
      multipart: { venue_id: owned.venueId!, alt_text: image.alt, credit: image.credit, file },
    });
    expect(response.status()).toBe(invalid.status);
    expect(record(await response.json()).error).toBe(invalid.api);
    expect(response.headers()["cache-control"]).toMatch(/no-store/i);
  }
  await expect(section.getByRole("heading", { name: "No saved photos", exact: true })).toBeVisible();
}

async function exerciseGallery(page: Page, owned: OwnedInventory): Promise<void> {
  const gallery = page.getByRole("region", { name: `Photographs of ${owned.venueName}`, exact: true });
  await expect(gallery.locator(".sh-gallery-item")).toHaveCount(2);
  const opener = gallery.getByRole("link", { name: /^Open photo 1 of 2:/ });
  await expect(opener).toHaveAttribute("href", `/media/${owned.photos[1].id}/1600`);
  const overflow = await page.locator("body").evaluate((element) => element.style.overflow);
  await opener.click();
  const dialog = page.getByRole("dialog", { name: new RegExp(`${owned.venueName}.*photographs`) });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close photo gallery", exact: true })).toBeFocused();
  await expect(dialog.locator('[aria-live="polite"]')).toHaveText(/Photo 1\s+of 2/);
  await loadedImage(dialog.getByRole("img", { name: owned.photos[1].alt_text, exact: true }));
  for (const key of ["Shift+Tab", "Tab", "Tab", "Tab", "Tab"]) {
    await page.keyboard.press(key);
    await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("ArrowRight");
  await expect(dialog.locator('[aria-live="polite"]')).toHaveText(/Photo 2\s+of 2/);
  await loadedImage(dialog.getByRole("img", { name: owned.photos[0].alt_text, exact: true }));
  await page.keyboard.press("ArrowRight");
  await expect(dialog.locator('[aria-live="polite"]')).toHaveText(/Photo 1\s+of 2/);
  await page.keyboard.press("ArrowLeft");
  await expect(dialog.locator('[aria-live="polite"]')).toHaveText(/Photo 2\s+of 2/);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await expect.poll(() => page.locator("body").evaluate((element) => element.style.overflow)).toBe(overflow);
}

async function exerciseBulkPublishing(page: Page, visitor: Page, observer: LocalClient, owned: OwnedInventory, width: number, allowed: Set<string>) {
  const cityList = `${CITY_WORKSPACE}?${new URLSearchParams({ status: "draft", q: owned.token })}`;
  const allList = `/admin/venues?${new URLSearchParams({ status: "draft", q: owned.token })}`;
  const dialog = page.getByRole("dialog", { name: /Review selected venues|Publication results/ });
  const opener = page.getByRole("button", { name: /^Review & publish/ });
  const approval = dialog.getByRole("checkbox", { name: /^I have reviewed the selected venues/ });
  const selectPage = page.getByRole("checkbox", { name: "Select all publishable statuses on this page", exact: true });
  const table = page.getByRole("region", { name: "Venue inventory", exact: true });
  await page.goto(cityList);
  await expect(opener).toBeDisabled();
  const paths = await table.locator("tbody .a-table-name").evaluateAll((links) => links.map((link) => new URL((link as HTMLAnchorElement).href).pathname));
  expect(paths.length).toBeGreaterThanOrEqual(2);
  expect(paths.length).toBeLessThanOrEqual(25);
  const ids = paths.map((path) => savedId(path.split("/").at(-1) ?? null));
  ids.forEach((id) => allowed.add(id));
  await table.locator("tbody input[type=checkbox]").first().check();
  await opener.click();
  await expect(dialog.locator("article")).toHaveCount(1);
  await expect(approval).not.toBeChecked();
  await expect(dialog.getByRole("button", { name: "Publish 1 venue", exact: true })).toBeDisabled();
  await approval.check();
  await expect(dialog.getByRole("button", { name: "Publish 1 venue", exact: true })).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  expect(checked(await observer.from("venues").select("id").eq("city_id", owned.cityId!).eq("status", "published"), "Cancel publishes nothing")).toEqual([]);

  await page.goto(paths[0]);
  await field(page, "Full address").fill("");
  await saveExisting(page, "venue");
  await page.goto(cityList);
  await selectPage.check();
  await opener.click();
  await expect(dialog.getByText(`${ids.length - 1} ready; 1 need attention.`, { exact: true })).toBeVisible();
  await expect(dialog.getByText("Add a full address and private source notes in the venue editor.", { exact: true })).toBeVisible();
  await expect(approval).not.toBeChecked();
  await approval.check();
  await dialog.getByRole("checkbox", { name: /^Include / }).first().uncheck();
  await expect(approval).not.toBeChecked();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(checked(await observer.from("venues").select("id").eq("city_id", owned.cityId!).eq("status", "published"), "Review publishes nothing")).toEqual([]);

  await page.goto(paths[0]);
  await field(page, "Full address").fill(owned.address);
  await saveExisting(page, "venue");
  await page.goto(allList);
  await selectPage.check();
  await opener.click();
  await expect(dialog.getByText(`${ids.length} ready; 0 need attention.`, { exact: true })).toBeVisible();
  for (const viewport of width === 768 ? [320, 375, 390, 414, 768, 1440] : [width]) {
    await page.setViewportSize({ width: viewport, height: viewport >= 768 ? 1000 : 844 });
    await auditLayout(page);
  }
  await page.setViewportSize({ width, height: width >= 768 ? 1000 : 844 });
  for (const key of ["Shift+Tab", "Tab", "Tab"]) {
    await page.keyboard.press(key);
    await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  expect(await dialog.locator(".a-bulk-source").count()).toBe(ids.length);
  const concurrent = await page.context().newPage();
  try {
    await concurrent.goto(paths[0]);
    await field(concurrent, "Private source notes").fill(`${owned.sourceNotes}\nLocal bulk-publication concurrent correction.`);
    await saveExisting(concurrent, "venue");
  } finally { await concurrent.close(); }
  const before = checked(await observer.from("venues").select("*").in("id", ids).order("id"), "Read selected records before publication")!;
  const sourcesBefore = checked(await observer.from("venue_research").select("venue_id,source_notes").in("venue_id", ids).order("venue_id"), "Read selected private sources")!;
  const facilitiesBefore = checked(await observer.from("venue_facilities").select("venue_id,facility_code").in("venue_id", ids).order("venue_id").order("facility_code"), "Read selected facilities")!;
  await approval.check();
  await dialog.getByRole("button", { name: `Publish ${ids.length} venues`, exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Publication results", exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(dialog.getByText(`${ids.length - 1} published; 1 unchanged or unconfirmed.`, { exact: true })).toBeVisible();
  await expect(dialog.getByText("Changed since selection", { exact: true })).toBeVisible();
  const after = checked(await observer.from("venues").select("*").in("id", ids).order("id"), "Observe bulk publication results")!;
  const facts = (venue: object) => Object.fromEntries(Object.entries(venue).filter(([key]) => !["status", "published_at", "updated_at"].includes(key)));
  expect(JSON.stringify(after.map(facts)) === JSON.stringify(before.map(facts)), "Bulk publication must preserve every saved venue fact").toBe(true);
  expect(after.filter((venue) => venue.status === "published")).toHaveLength(ids.length - 1);
  expect(after.find((venue) => venue.id === ids[0])).toEqual(before.find((venue) => venue.id === ids[0]));
  const sourcesAfter = checked(await observer.from("venue_research").select("venue_id,source_notes,reviewed_at,reviewed_by").in("venue_id", ids).order("venue_id"), "Observe actual review attribution")!;
  expect(JSON.stringify(sourcesAfter.map(({ venue_id, source_notes }) => ({ venue_id, source_notes }))) === JSON.stringify(sourcesBefore), "Private notes must remain unchanged").toBe(true);
  expect(sourcesAfter.filter((entry) => entry.venue_id !== ids[0]).every((entry) => entry.reviewed_at && entry.reviewed_by)).toBe(true);
  expect(checked(await observer.from("venue_facilities").select("venue_id,facility_code").in("venue_id", ids).order("venue_id").order("facility_code"), "Observe unchanged facilities")).toEqual(facilitiesBefore);
  expect(checked(await observer.from("cities").select("status").eq("id", owned.cityId!).single(), "Bulk publication never activates a city")?.status).toBe("draft");
  await visitPublic(visitor, `${CITY_PATH}/vivah-bhawan/${after.find((venue) => venue.status === "published")!.slug}`, 404, publicSafety(integrationEnvironment(width), owned));
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(opener).toBeDisabled();
  console.info(`Integration bulk publishing: ${ids.length} selected; one real concurrent conflict; facts, sources and verification preserved; city unchanged.`);
  for (const venue of after.filter((entry) => entry.status === "published")) {
    await page.goto(`/admin/venues/${venue.id}`);
    await field(page, "Publication status").selectOption("draft");
    await saveExisting(page, "venue");
  }
}

async function exerciseExcelImport(page: Page, visitor: Page, ordinary: Page, observer: LocalClient, owned: OwnedInventory, width: number) {
  const count = width === 390 ? 1000 : width === 768 ? 25 : 2;
  const bulkTargets = new Set<string>();
  const widths = width === 390 ? [320, 375, 390, 414, 768, 1024, 1440, 1920] : [width];
  const names = Array.from({ length: count }, (_, index) => `Synthetic Local Excel ${String(index).padStart(3, "0")} ${owned.token}`);
  const slugs = names.map((name) => name.toLowerCase().replaceAll(" ", "-"));
  const expected = new Map(slugs.map((slug, index) => [slug, names[index]]));
  const mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const path = "/api/admin/venue-import";
  const layout = async () => {
    for (const viewport of widths) {
      await page.setViewportSize({ width: viewport, height: viewport >= 768 ? 1000 : 844 });
      await auditLayout(page);
    }
    await page.setViewportSize({ width, height: width >= 768 ? 1000 : 844 });
  };
  await page.goto(CITY_WORKSPACE);
  await page.getByRole("link", { name: "Import Excel", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Import venues from Excel");
  await expect(page.getByText("Chapra, Bihar, India", { exact: true })).toBeVisible();
  await layout();
  const download = page.getByRole("link", { name: "Download template", exact: true });
  await expect(download).toHaveAttribute("href", `${path}?city_id=${owned.cityId}`);
  const template = await page.request.get(`${path}?city_id=${owned.cityId}`, API);
  expect(template.status()).toBe(200);
  expect(template.headers()["content-type"]).toBe(mimeType);
  expect(template.headers()["content-disposition"]).toContain("shagun-chapra-venue-template.xlsx");
  expect(template.headers()["cache-control"]).toMatch(/private.*no-store/);
  expect(template.headers()["x-robots-tag"]).toContain("noindex");
  const templateBytes = await template.body();
  const workbook = async (rows: number, invalid = false) => {
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Uint8Array.from(templateBytes).buffer);
    const sheet = book.getWorksheet("Venues")!;
    const headers = sheet.getRow(1).values as ExcelJS.CellValue[];
    for (let index = 0; index < rows; index++) {
      const values: Record<string, ExcelJS.CellValue> = {
        name: names[index], slug: slugs[index], venue_type: invalid && index === 1 ? "unsupported" : "banquet_hall",
        description: owned.venueDescription, locality: "Synthetic Local Test Quarter", address: owned.address,
        phone: "+12025550123", alternate_phone: "+12025550124", whatsapp: "+12025550125", email: "qa@example.invalid",
        capacity_min: 100, capacity_max: 400, price_min: 10000, price_max: 30000, price_type: "per_event",
        latitude: 25.78, longitude: 84.73, seo_title: "Synthetic local Excel venue", seo_description: "Local integration only, not real inventory.",
        source_notes: owned.sourceNotes, ac: "yes", parking: "yes", rooms: "yes", catering: "yes", decoration: "yes",
        kitchen: "yes", power_backup: "yes", lift: "yes", accessible_entry: "yes",
      };
      headers.forEach((header, column) => { if (column) sheet.getRow(index + 2).getCell(column).value = values[String(header)] ?? null; });
    }
    return { name: "synthetic-local-venues.xlsx", mimeType, buffer: Buffer.from(await book.xlsx.writeBuffer()) };
  };
  const validate = async (file: Awaited<ReturnType<typeof workbook>>, status: number) => {
    await page.getByLabel("Excel workbook", { exact: true }).setInputFiles(file);
    await expect(page.getByRole("button", { name: "Validate workbook", exact: true })).toBeEnabled();
    const failedRequests: string[] = [];
    const requestFailed = (request: import("@playwright/test").Request) => {
      if (request.url().includes(path)) failedRequests.push(`${request.method()} ${new URL(request.url()).pathname}`);
    };
    page.on("requestfailed", requestFailed);
    const [response] = await Promise.all([
      page.waitForResponse((value) => new URL(value.url()).pathname === path && value.request().method() === "POST", { timeout: 20_000 }).catch(() => null),
      page.getByRole("button", { name: "Validate workbook", exact: true }).click(),
    ]);
    page.off("requestfailed", requestFailed);
    if (!response) throw new Error(`Excel validation produced no response (${failedRequests.join(", ") || "no request failure observed"}).`);
    expect(response.status()).toBe(status);
    const result = record(await response.json());
    await expect(page.getByRole("button", { name: "Validate workbook", exact: true })).toBeEnabled();
    await expect(page.locator(".a-import-feedback")).toBeFocused();
    return result;
  };
  try {
    const single = await workbook(1);
    for (const denied of [visitor, ordinary]) {
      await assertDenied(await denied.request.get(`${path}?city_id=${owned.cityId}`, API));
      await assertDenied(await denied.request.post(path, { ...API, headers: SAME_ORIGIN, multipart: { city_id: owned.cityId!, mode: "validate", file: single } }));
    }
    await validate(await workbook(0), 422);
    await expect(page.getByRole("region", { name: "Workbook errors", exact: true }).getByRole("cell", { name: "Add at least one venue below the headers.", exact: true })).toBeVisible();
    await validate(single, 200);
    await expect(page.getByRole("button", { name: "Import 1 draft", exact: true })).toBeVisible();
    await layout();
    await validate(await workbook(2, true), 422);
    await expect(page.getByRole("button", { name: /^Import \d+ drafts?$/ })).toHaveCount(0);
    expect(checked(await observer.from("venues").select("id").eq("city_id", owned.cityId!), "Validation-only inventory")).toEqual([]);
    const batch = await workbook(count);
    await validate(batch, 200);
    await expect(page.getByRole("region", { name: "Venue import rows", exact: true }).locator("tbody tr")).toHaveCount(count);
    await layout();
    const responses: Promise<{ status: number; body: Record<string, unknown> }>[] = [];
    const captureBatch = (response: Response) => {
      if (new URL(response.url()).pathname === path && response.request().method() === "POST") {
        responses.push(response.json().then((body: unknown) => ({ status: response.status(), body: record(body) })));
      }
    };
    page.on("response", captureBatch);
    try {
      await page.getByRole("button", { name: `Import ${count} drafts`, exact: true }).click();
      await expect(page.getByRole("button", { name: "Stop import", exact: true })).toBeVisible();
      await expect(page.locator(".a-import-feedback")).toContainText(`${count} drafts confirmed`, { timeout: 240_000 });
      const batches = await Promise.all(responses);
      expect(batches).toHaveLength(Math.ceil(count / 100));
      batches.forEach((batch, index) => {
        const created = Math.min(100, count - index * 100);
        expect(batch.status).toBe(200);
        expect(batch.body).toMatchObject({ phase: index === batches.length - 1 ? "imported" : "importing",
          offset: index * 100, totalRows: count, created, skipped: 0, remaining: count - index * 100 - created });
      });
    } finally { page.off("response", captureBatch); }
    await expect(page.getByRole("region", { name: "Venue import rows", exact: true }).getByText("Draft created", { exact: true })).toHaveCount(count);
    await layout();
    const venues = checked(await observer.from("venues").select("*").eq("city_id", owned.cityId!), "Observe imported draft batch");
    expect(venues?.length).toBe(count);
    expect(venues?.every((venue) => venue.status === "draft" && venue.verification_status === "unverified" && venue.verified_at === null && venue.published_at === null)).toBe(true);
    const first = venues?.find((venue) => venue.slug === slugs[0]);
    if (!first) throw new Error("The expected local workbook draft was not saved.");
    expect(first).toMatchObject({ city_id: owned.cityId, name: names[0], description: owned.venueDescription, locality: "Synthetic Local Test Quarter",
      address: owned.address, phone: "+12025550123", alternate_phone: "+12025550124", whatsapp: "+12025550125", email: "qa@example.invalid",
      capacity_min: 100, capacity_max: 400, price_min: 10000, price_max: 30000, price_type: "per_event", latitude: 25.78, longitude: 84.73,
      seo_title: "Synthetic local Excel venue", seo_description: "Local integration only, not real inventory." });
    const ids = venues!.map((venue) => venue.id);
    for (let offset = 0; offset < ids.length; offset += 100) {
      const group = ids.slice(offset, offset + 100);
      const research = checked(await observer.from("venue_research").select("venue_id,source_notes,reviewed_at,reviewed_by").in("venue_id", group), "Observe imported private notes");
      expect(research?.length).toBe(group.length);
      expect(research?.every((entry) => entry.source_notes === owned.sourceNotes && entry.reviewed_at === null && entry.reviewed_by === null)).toBe(true);
    }
    expect(checked(await observer.from("venue_facilities").select("facility_code").eq("venue_id", first.id), "Observe imported facilities")?.length).toBe(9);
    expect(checked(await observer.from("cities").select("status").eq("id", owned.cityId!).single(), "Observe unchanged city lifecycle")?.status).toBe("draft");
    await visitPublic(visitor, `${CITY_PATH}/vivah-bhawan/${first.slug}`, 404, publicSafety(integrationEnvironment(width), owned));
    await page.getByRole("link", { name: names[0], exact: true }).click();
    await expect(field(page, "Publication status")).toHaveValue("draft");
    await expect(field(page, "Verification status")).toHaveValue("unverified");
    await expect(page.getByRole("checkbox", { name: /^I have reviewed/ })).not.toBeChecked();
    const editedNotes = `${owned.sourceNotes}\nLocal UI correction after Excel import.`;
    await field(page, "Private source notes").fill(editedNotes);
    await saveExisting(page, "venue");
    const beforeRetry = checked(await observer.from("venues").select("updated_at").eq("id", first.id).single(), "Read exact version before retry");
    const researchBeforeRetry = checked(await observer.from("venue_research").select("source_notes,updated_at").eq("venue_id", first.id).single(), "Confirm UI correction before retry");
    expect(researchBeforeRetry?.source_notes.replace(/\r\n/g, "\n") === editedNotes, "The UI correction must be saved before testing an import retry").toBe(true);
    await page.goto(`${CITY_WORKSPACE}/import`);
    const retryValidation = await validate(batch, 200);
    expect(retryValidation).toMatchObject({ remaining: 0, skipped: count });
    await expect(page.getByRole("button", { name: /^Import \d+ drafts?$/ })).toHaveCount(0);
    for (let offset = 0; offset < count; offset += 100) {
      const retry = await page.request.post(path, { ...API, headers: SAME_ORIGIN,
        multipart: { city_id: owned.cityId!, mode: "import", digest: String(retryValidation.digest), offset: String(offset), file: batch } });
      expect(retry.status()).toBe(200);
      const skipped = Math.min(100, count - offset);
      expect(record(await retry.json())).toMatchObject({ phase: offset + skipped === count ? "imported" : "importing", created: 0, skipped, remaining: count - offset - skipped });
    }
    expect(checked(await observer.from("venues").select("updated_at").eq("id", first.id).single(), "Observe unchanged version after retry")).toEqual(beforeRetry);
    const researchAfterRetry = checked(await observer.from("venue_research").select("source_notes,updated_at").eq("venue_id", first.id).single(), "Observe preserved UI correction");
    expect(JSON.stringify(researchAfterRetry) === JSON.stringify(researchBeforeRetry), "Retry must preserve the exact saved note and research timestamp").toBe(true);
    console.info(`Integration Excel: ${count} drafts; all fields; retry preserves edits; empty/one/many/results layouts at ${widths.join(",")}; no publication.`);
    await exerciseBulkPublishing(page, visitor, observer, owned, width, bulkTargets);
  } finally {
    const saved = checked(await observer.from("venues").select("id,city_id,name,slug,status,description").eq("city_id", owned.cityId!), "Inspect exact run-owned workbook drafts for UI cleanup");
    for (const venue of saved ?? []) {
      if (venue.city_id !== owned.cityId || venue.name !== expected.get(venue.slug) || venue.description !== owned.venueDescription
        || (venue.status !== "draft" && !(venue.status === "published" && bulkTargets.has(venue.id)))) {
        throw new Error("Workbook draft identity changed; refusing cleanup.");
      }
    }
    const extraPages = saved && saved.length > 100 ? await Promise.all(Array.from({ length: 3 }, () => page.context().newPage())) : [];
    const cleanupPages = [page, ...extraPages];
    try {
      const results = await Promise.allSettled(cleanupPages.map(async (cleanupPage, worker) => {
        for (let index = worker; index < (saved?.length ?? 0); index += cleanupPages.length) {
          const venue = saved![index];
          await cleanupPage.goto(`/admin/venues/${venue.id}`);
          if (venue.status === "published") {
            await field(cleanupPage, "Publication status").selectOption("draft");
            await saveExisting(cleanupPage, "venue");
          }
          await deleteFromUI(cleanupPage, "venue", venue.id, venue.name);
        }
      }));
      for (const result of results) if (result.status === "rejected") throw result.reason;
    } finally { await Promise.all(extraPages.map((cleanupPage) => cleanupPage.close())); }
    expect(checked(await observer.from("venues").select("id").eq("city_id", owned.cityId!), "Confirm run-owned workbook draft cleanup")).toEqual([]);
    await page.setViewportSize({ width, height: width >= 768 ? 1000 : 844 });
  }
}

test("real local admin lifecycle, Auth, city discovery, Storage and cleanup", async ({ browser }, info) => {
  const width = assertRunConfiguration(info);
  test.setTimeout(width === 390 ? 900_000 : 240_000);
  const env = integrationEnvironment(width);
  const owned = newInventory(width);
  const safe = publicSafety(env, owned);
  const { anonymous, observer } = localClients(env);
  const adminScope = await isolatedContext(browser, width, safe);
  const visitorScope = await isolatedContext(browser, width, safe);
  const ordinaryScope = await isolatedContext(browser, width, safe);
  const scopes = [adminScope, visitorScope, ordinaryScope];
  const page = await adminScope.context.newPage();
  const visitor = await visitorScope.context.newPage();
  const ordinaryPage = await ordinaryScope.context.newPage();
  const session = browserSession(adminScope.context, env);
  // SSR's pending cookie overlay is request-scoped; each later probe must read
  // the current browser cookies, including any genuine application refresh.
  const ordinary = () => browserSession(ordinaryScope.context, env);
  let adminId: string | undefined;
  let ordinaryEstablished = false;

  try {
    await test.step("Reject bad credentials; sign in and refresh the actual HttpOnly Auth session", async () => {
      console.info("Integration: checking public draft denial");
      await visitPublic(visitor, CITY_PATH, 404, safe);
      console.info("Integration: checking logged-out routes and APIs");
      await assertSignedOut(visitor, "/admin/cities");
      await assertDenied(await visitor.request.get("/api/admin/city-catalog?q=Chapra&state=IN.34&limit=12", API));
      await assertLoginBudget(observer, env, width);
      console.info("Integration: submitting invalid password");
      await login(page, { email: env.admin.email, password: `Invalid-local-only-${randomUUID()}!` });
      await assertLoginRejected(page);
      console.info("Integration: submitting valid local administrator credentials");
      await login(page, env.admin);
      const feedback = page.getByRole("region", { name: "Sign in to Shagun", exact: true }).getByRole("alert");
      if (await feedback.count()) {
        const message = await feedback.textContent();
        console.info(`Integration login feedback: ${message === "Unable to sign in. Check your credentials and administrator access, then try again." ? "credential-or-membership-rejection" : message?.includes("Too many") ? "rate-limited" : "other-sanitized-feedback"}`);
      }
      await expect(page).toHaveURL(`${INTEGRATION_ORIGIN}/admin`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Inventory overview");
      await auditLayout(page);
      console.info("Integration: validating UI-issued managed session");
      const user = checked(await session.auth.getUser(), "Validate UI-issued admin session").user;
      if (!user) throw new Error("UI login did not establish a real Supabase user.");
      adminId = user.id;
      expect(checked(await session.rpc("is_admin", {}), "Validate active UUID allowlist")).toBe(true);
      const cookies = (await adminScope.context.cookies(INTEGRATION_ORIGIN)).filter((cookie) => cookie.name === ADMIN_COOKIE || cookie.name.startsWith(`${ADMIN_COOKIE}.`));
      expect(cookies.length).toBeGreaterThan(0);
      expect(cookies.every((cookie) => cookie.httpOnly && cookie.sameSite === "Lax" && !cookie.secure && cookie.path === "/")).toBe(true);
      const before = checked(await session.auth.getSession(), "Read UI-issued session for actual refresh").session;
      console.info("Integration: refreshing real local Auth session");
      const refreshed = checked(await session.auth.refreshSession(), "Refresh through real local Supabase Auth").session;
      if (!before || !refreshed) throw new Error("Supabase did not return a session during refresh.");
      expect(refreshed.user.id === before.user.id).toBe(true);
      expect(refreshed.refresh_token !== before.refresh_token, "GoTrue must rotate the actual refresh token").toBe(true);
      const after = (await adminScope.context.cookies(INTEGRATION_ORIGIN)).filter((cookie) => cookie.name === ADMIN_COOKIE || cookie.name.startsWith(`${ADMIN_COOKIE}.`));
      expect(after.map((cookie) => cookie.value).join("") !== cookies.map((cookie) => cookie.value).join(""), "Real refreshed cookies must reach the browser").toBe(true);
      await page.reload();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Inventory overview");
      await assertSignedOut(visitor, `${CITY_WORKSPACE}/preview`);
      // Even an actual admin cookie cannot widen public suggestions to the draft seed.
      await publicCitySuggestions(page, "haza", false, safe);
      await publicCitySuggestions(visitor, "haza", false, safe);
    }, { timeout: 60_000 });

    await test.step("Prove non-admin Auth is insufficient and refuse any preexisting Chapra", async () => {
      await login(ordinaryPage, env.nonadmin);
      await assertLoginRejected(ordinaryPage);
      // The application correctly signs a non-admin out. Obtain a real ordinary
      // GoTrue session (not a fabricated cookie) solely to probe allowlist/RLS.
      const auth = checked(await ordinary().auth.signInWithPassword(env.nonadmin), "Authenticate the isolated ordinary account");
      if (!auth.user || !auth.session) throw new Error("The parent must provision the real non-admin local account.");
      ordinaryEstablished = true;
      expect(auth.user.id !== adminId).toBe(true);
      expect(checked(await ordinary().rpc("is_admin", {}), "Check ordinary user's absent allowlist membership")).toBe(false);
      await assertSignedOut(ordinaryPage, "/admin/cities");
      await assertDenied(await ordinaryPage.request.get("/api/admin/city-catalog?q=Chapra&state=IN.34&limit=12", API));

      await page.goto(CITY_WORKSPACE);
      const heading = page.getByRole("heading", { level: 1 });
      await expect(heading).toHaveText(/^(Record not found|Chapra)$/);
      if (await heading.innerText() === "Chapra") throw new Error("Preexisting Chapra detected in the authenticated UI. Aborting without changing or deleting it.");
      await assertFreshInventory(observer, owned);
      await publicSitemap(anonymous, [], safe);
      const hidden = checked(await ordinary().from("cities").select("id").eq("id", owned.baseline!.id), "Read ordinary user's hidden seed");
      expect(hidden).toEqual([]);
      const deniedPreview = await ordinary().rpc("preview_city_venues", { p_city: owned.baseline!.id });
      expect(deniedPreview.status).toBe(403);
      expect(deniedPreview.error?.code).toBe("42501");
    });

    await test.step("Preview the actual draft Hazaribag seed without importing or editing real venues", async () => {
      await page.goto("/admin/cities/hazaribag");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hazaribag");
      await expect(page.getByRole("link", { name: "Saved city preview", exact: true })).toHaveAttribute("href", "/admin/cities/hazaribag/preview");
      await assertPreview(page, "/admin/cities/hazaribag/preview", "Hazaribag.", safe);
      await expect(page.locator(".sh-city-page")).toHaveCount(1);
      await expect(page.getByRole("heading", { name: "0 venues to explore", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "No saved draft or published venues yet.", exact: true })).toBeVisible();
      await visitPublic(visitor, "/city/hazaribag", 404, safe);
    });

    await test.step("Create Chapra through the authenticated GeoNames selector and save only a draft", async () => {
      await page.getByRole("navigation", { name: "Administration", exact: true }).getByRole("link", { name: "Cities", exact: true }).click();
      await page.getByRole("link", { name: "Add city", exact: true }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Add a city");
      const create = editor(page).getByRole("button", { name: "Create city", exact: true });
      const search = page.getByRole("combobox", { name: "City", exact: true });
      await expect(create).toBeDisabled();
      await expect(editor(page).locator('input:not([type="hidden"]),select,textarea')).toHaveCount(1);
      await expect(page.getByLabel("Filter by state / union territory", { exact: true })).toHaveCount(0);
      await expect(page.getByLabel("SEO title override", { exact: true })).toHaveCount(0);
      for (const [query, stateName] of [["Ahmedabad", "Gujarat"], ["Chennai", "Tamil Nadu"], ["Guwahati", "Assam"]]) {
        const [response] = await Promise.all([
          page.waitForResponse((value) => {
            const url = new URL(value.url());
            return url.pathname === "/api/admin/city-catalog" && url.searchParams.get("q") === query && !url.searchParams.has("state");
          }),
          search.fill(query),
        ]);
        expect(response.status()).toBe(200);
        const choice = page.getByRole("option").filter({ hasText: `${stateName}, India` }).first();
        await expect(choice).toBeVisible();
        await choice.click();
        await expect(create).toBeEnabled();
      }
      const [response] = await Promise.all([
        page.waitForResponse((value) => {
          const url = new URL(value.url());
          return url.origin === INTEGRATION_ORIGIN && url.pathname === "/api/admin/city-catalog" && url.searchParams.get("q") === "Chapra" && !url.searchParams.has("state");
        }),
        search.fill("Chapra"),
      ]);
      expect(response.status()).toBe(200);
      expect(response.headers()["cache-control"]).toMatch(/private.*no-store/i);
      const catalog = record(await response.json());
      expect(catalog.source).toMatchObject({ name: "GeoNames", license: "CC BY 4.0" });
      if (!Array.isArray(catalog.items)) throw new Error("The actual city catalog API did not return results.");
      expect(catalog.items.some((item: unknown) => {
        const city = record(item);
        return city.id === "geonames:1274353" && city.name === "Chapra" && city.state === "Bihar" && city.district === "Saran";
      })).toBe(true);
      const choice = page.getByRole("listbox", { name: "Matching catalog cities", exact: true }).getByRole("option").filter({ hasText: "Bihar, India · District: Saran" });
      await expect(choice).toHaveCount(1);
      await expect(choice).toContainText("Bihar, India · District: Saran");
      await auditLayout(page);
      await choice.click();
      if (width === 390) {
        for (const viewport of [320, 375, 390, 414, 768, 1440]) {
          await page.setViewportSize({ width: viewport, height: viewport >= 768 ? 1000 : 844 });
          await auditLayout(page);
        }
        await page.setViewportSize({ width, height: 844 });
      }
      await expect(editor(page).locator('input[name="catalog_id"]')).toHaveValue("geonames:1274353");
      expect(checked(await observer.from("cities").select("id").eq("slug", "chapra"), "Selection alone must not create a city")).toEqual([]);
      owned.citySaveStarted = true;
      await submitEditor(page, "Create city");
      await expect(page).toHaveURL(`${INTEGRATION_ORIGIN}${CITY_WORKSPACE}`);
      await page.goto(`${CITY_WORKSPACE}/edit`);
      owned.cityId = savedId(await editor(page).locator('input[name="id"]').inputValue());
      const saved = checked(await observer.from("cities").select("id,name,state,country,slug,status,metadata,description,seo_title,seo_description").eq("id", owned.cityId).single(), "Observe UI-created city");
      expect(saved).toMatchObject({ id: owned.cityId, name: "Chapra", state: "Bihar", country: "India", slug: "chapra", status: "draft",
        description: null, seo_title: null, seo_description: null, metadata: { geographic_source_id: "geonames:1274353" } });
      await field(page, "City introduction").fill(owned.cityDescription);
      await saveExisting(page, "city");
      await assertPreview(page, `${CITY_WORKSPACE}/preview`, "Chapra.", safe);
      await expect(page.getByRole("heading", { name: "0 venues to explore", exact: true })).toBeVisible();
      await expect(page.locator(".sh-city-page")).toHaveCount(1);
      await visitPublic(visitor, CITY_PATH, 404, safe);
      await publicCitySuggestions(visitor, "Chap", false, safe);
    });

    await test.step("Download Excel, validate rows, import only drafts, preserve retries and clean up through the UI", async () => {
      await exerciseExcelImport(page, visitor, ordinaryPage, observer, owned, width);
    });

    await test.step("Upload a genuine local city cover, preview it privately, and keep the draft image inaccessible", async () => {
      await page.goto(`${CITY_WORKSPACE}/edit`);
      const image = (await generatedImages(`${owned.token}-city`))[0];
      const cover = await uploadPhoto(page, owned, image, "city");
      expect(cover.city_id).toBe(owned.cityId);
      expect(cover.venue_id).toBeNull();
      expect(cover.is_cover).toBe(true);
      await assertStoredVariants(observer, cover.storage_key, true);
      for (const width of [480, 960, 1600]) await assertImageResponse(await page.request.get(`/api/admin/media/${cover.id}?w=${width}`, API), true, width);
      expect((await visitor.request.get(`/media/${cover.id}/480`, API)).status()).toBe(404);
      await assertDenied(await ordinaryPage.request.get(`/api/admin/media/${cover.id}?w=480`, API));
      await auditLayout(page);
      await assertPreview(page, `${CITY_WORKSPACE}/preview`, "Chapra.", safe);
      await loadedImage(page.getByRole("region", { name: "Photographs of Chapra", exact: true }).getByRole("img", { name: image.alt, exact: true }));
    });

    await test.step("Add the associated venue through the workspace and save private research atomically", async () => {
      await page.goto(CITY_WORKSPACE);
      const add = page.getByRole("link", { name: "Add venue", exact: true });
      await expect(add).toHaveAttribute("href", `/admin/venues/new?city=${owned.cityId}`);
      await add.click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Add a venue");
      await expect(page.locator("#venue-city_id")).toContainText("Chapra · Bihar, India");
      await expect(editor(page).locator('input[name="city_id"]')).toHaveValue(owned.cityId!);
      await field(page, "Venue name").fill(owned.venueName);
      await field(page, "Venue type").selectOption({ label: "Banquet hall" });
      await expect(field(page, "Venue URL slug")).toHaveValue(owned.venueSlug);
      for (const [label, value] of [
        ["Description", owned.venueDescription], ["Full address", owned.address], ["Locality / neighbourhood", "Synthetic Local Test Quarter"],
        ["Phone", "+12025550123"], ["WhatsApp number", "+12025550123"],
        ["Minimum capacity (guests)", "100"], ["Maximum capacity (guests)", "400"],
        ["Minimum price (INR)", "10000"], ["Maximum price (INR)", "30000"], ["Private source notes", owned.sourceNotes],
      ]) await field(page, label).fill(value);
      await field(page, "Price basis").selectOption("per_event");
      await page.getByRole("checkbox", { name: "Parking", exact: true }).check();
      await page.getByRole("checkbox", { name: "Accessible entry", exact: true }).check();
      await expect(field(page, "Publication status")).toHaveValue("draft");
      await expect(field(page, "Verification status")).toHaveValue("unverified");
      await expect(page.getByRole("checkbox", { name: /^I have reviewed/ })).not.toBeChecked();
      owned.venueSaveStarted = true;
      await submitEditor(page, "Save venue & continue");
      await expect(page).toHaveURL((url) => UUID_PATH.test(url.pathname) && url.searchParams.get("saved") === "1");
      owned.venueId = savedId(UUID_PATH.exec(new URL(page.url()).pathname)?.[1] ?? null);
      await expect(editor(page).locator('input[name="id"]')).toHaveValue(owned.venueId);
      await expect(field(page, "Private source notes")).toHaveValue(owned.sourceNotes);
      await auditLayout(page);
      const research = checked(await observer.from("venue_research").select("reviewed_at,reviewed_by,source_notes").eq("venue_id", owned.venueId).single(), "Observe saved private draft research");
      expect(research?.source_notes === owned.sourceNotes).toBe(true);
      expect(research?.reviewed_at).toBeNull();
      expect(research?.reviewed_by).toBeNull();
      await assertWorkspaceCounts(page, 0, 1);
      await assertPreview(page, `${CITY_WORKSPACE}/preview`, "Chapra.", safe);
      await expect(venueNames(page)).toHaveText([owned.venueName]);
      await expect(page.getByText("Saved status: Draft", { exact: true })).toBeVisible();
    });

    await test.step("Reject invalid images; upload real PNG, JPEG and WebP bytes sequentially", async () => {
      await page.goto(`/admin/venues/${owned.venueId}`);
      const images = await generatedImages(owned.token);
      await invalidUploads(page, owned, images[0]);
      for (const image of images) {
        const photo = await uploadPhoto(page, owned, image);
        await assertStoredVariants(observer, photo.storage_key, true);
        for (const size of [480, 960, 1600]) {
          await assertImageResponse(await page.request.get(`/api/admin/media/${photo.id}?w=${size}`, API), true, size);
        }
        expect((await visitor.request.get(`/media/${photo.id}/480`, API)).status()).toBe(404);
        const rawStorage = await anonymous.storage.from(MEDIA_BUCKET).download(`${photo.storage_key}/480.webp`);
        expect(Boolean(rawStorage.error), "A private bucket object is not an anonymous public capability").toBe(true);
        const status = rawStorage.error && "status" in rawStorage.error ? Number(rawStorage.error.status) : undefined;
        expect([400, 401, 403, 404], "Storage must reject access, not merely fail with a transport/provider outage").toContain(status);
        expect(rawStorage.data === null).toBe(true);
      }
      const first = owned.photos[0];
      const ordinaryUser = checked(await ordinary().auth.getUser(), "Prove ordinary API probes carry a real authenticated session").user;
      expect(Boolean(ordinaryUser) && ordinaryUser!.id !== adminId).toBe(true);
      await assertDenied(await ordinaryPage.request.get(`/api/admin/media/${first.id}?w=480`, API));
      await assertDenied(await ordinaryPage.request.patch(`/api/admin/media/${first.id}`, {
        ...API, headers: SAME_ORIGIN, data: { operation: "metadata", alt_text: first.alt_text, credit: first.credit },
      }));
      await assertDenied(await ordinaryPage.request.delete(`/api/admin/media/${first.id}`, { ...API, headers: SAME_ORIGIN }));
      await assertDenied(await ordinaryPage.request.post("/api/admin/media", {
        ...API, headers: SAME_ORIGIN, multipart: {
          venue_id: owned.venueId!, alt_text: first.alt_text, credit: first.credit!,
          file: { name: images[0].name, mimeType: images[0].mimeType, buffer: images[0].buffer },
        },
      }));
      expect(checked(await observer.from("media_assets").select("id").eq("venue_id", owned.venueId!), "Non-admin attempts must leave all photos intact")?.length).toBe(3);
      await auditLayout(page);
    });

    await test.step("Select the second cover, reorder both ways, edit metadata, delete and drain its Storage job", async () => {
      const [first, second, third] = owned.photos;
      await mutation(page, second.id, photoCard(page, second.id).getByRole("button", { name: "Set photo 2 as cover", exact: true }));
      await expect(photoCard(page, second.id).getByRole("button", { name: "Set photo 2 as cover", exact: true })).toBeDisabled();
      expect(checked(await observer.from("media_assets").select("id").eq("venue_id", owned.venueId!).eq("is_cover", true), "Observe cover selection")).toEqual([{ id: second.id }]);
      await mutation(page, second.id, photoCard(page, second.id).getByRole("button", { name: "Move photo 2 up", exact: true }));
      await expect(savedPhotos(page).locator("img").nth(0)).toHaveAttribute("src", `/api/admin/media/${second.id}?w=480`);
      await mutation(page, second.id, photoCard(page, second.id).getByRole("button", { name: "Move photo 1 down", exact: true }));
      await expect(savedPhotos(page).locator("img").nth(0)).toHaveAttribute("src", `/api/admin/media/${first.id}?w=480`);
      await expect(savedPhotos(page).locator("img").nth(1)).toHaveAttribute("src", `/api/admin/media/${second.id}?w=480`);
      await photoCard(page, second.id).locator("summary").click();
      const details = photoCard(page, second.id).getByRole("form", { name: "Edit photo description and credit", exact: true });
      const alt = "Synthetic original geometric cover: blue rectangle centred on cream, local test only. Not a venue photograph.";
      const credit = "Original geometric cover created by this isolated test; synthetic local-only image, no real venue photo.";
      await field(details, "Alternative text").fill(alt);
      await field(details, "Rights / provenance credit").fill(credit);
      await mutation(page, second.id, details.getByRole("button", { name: "Save photo details", exact: true }));
      await expect(photoCard(page, second.id).getByRole("img")).toHaveAttribute("alt", alt);
      await expect(photoCard(page, second.id).locator(".a-photo-body > p.a-muted")).toHaveText(credit);
      second.alt_text = alt; second.credit = credit;

      await Promise.all([
        page.waitForEvent("dialog").then(async (dialog) => {
          if (dialog.type() !== "confirm" || !dialog.message().includes(third.alt_text)) {
            await dialog.dismiss();
            throw new Error("The photo confirmation did not identify this run's selected image; deletion was not confirmed.");
          }
          await dialog.accept();
        }),
        mutation(page, third.id, photoCard(page, third.id).getByRole("button", { name: "Delete photo 3", exact: true }), "DELETE"),
      ]);
      await expect(savedPhotos(page).getByRole("listitem")).toHaveCount(2);
      expect(checked(await observer.from("media_assets").select("id").eq("id", third.id), "Observe deleted media row")).toEqual([]);
      expect(checked(await observer.from("storage_cleanup_jobs").select("storage_key").eq("storage_key", third.storage_key), "Observe durable deletion job")).toEqual([{ storage_key: third.storage_key }]);
      await runOwnedStorageCleanup(page, observer, owned);
      await assertStoredVariants(observer, first.storage_key, true);
      await assertStoredVariants(observer, second.storage_key, true);
    });

    await test.step("Inspect real saved previews, explicitly review/publish, and retain the draft city's privacy", async () => {
      await assertPreview(page, `/admin/venues/${owned.venueId}/preview`, owned.venueName, safe);
      const gallery = page.getByRole("region", { name: `Photographs of ${owned.venueName}`, exact: true });
      await expect(gallery.locator(".sh-gallery-item")).toHaveCount(2);
      for (const photo of owned.photos.slice(0, 2)) await loadedImage(gallery.getByRole("img", { name: photo.alt_text, exact: true }));
      await setVenueStatus(page, owned, "published");
      const reviewed = checked(await observer.from("venue_research").select("reviewed_at,reviewed_by").eq("venue_id", owned.venueId!).single(), "Observe explicit editorial review");
      expect(reviewed?.reviewed_by).toBe(adminId);
      expect(typeof reviewed?.reviewed_at).toBe("string");
      await expect(field(page, "Verification status")).toHaveValue("unverified");
      await expect(field(page, "Last checked date")).toHaveValue("");
      await expect(field(page, "Venue URL slug")).toBeDisabled();
      await assertWorkspaceCounts(page, 1, 0);
      await assertPreview(page, `${CITY_WORKSPACE}/preview`, "Chapra.", safe);
      await expect(page.getByRole("complementary", { name: "Authenticated city preview notice" })).toContainText("Draft");
      await expect(page.getByText("Saved status: Published", { exact: true })).toBeVisible();
      await expect(venueNames(page)).toHaveText([owned.venueName]);
      await loadedImage(page.locator(".sh-venue-card").getByRole("img", { name: owned.photos[1].alt_text, exact: true }));
      await visitPublic(visitor, CITY_PATH, 404, safe);
      await visitPublic(visitor, `${CITY_PATH}/vivah-bhawan/${owned.venueSlug}`, 404, safe);
      await publicCitySuggestions(visitor, "Chap", false, safe);
      expect((await visitor.request.get(`/media/${owned.photos[1].id}/480`, API)).status()).toBe(404);
      await publicSitemap(anonymous, [], safe);
      const blockedResearch = await anonymous.from("venue_research").select("source_notes").eq("venue_id", owned.venueId!);
      expect(blockedResearch.error?.code).toBe("42501");
      expect(checked(await ordinary().from("venue_research").select("source_notes").eq("venue_id", owned.venueId!), "Ordinary user's research RLS")).toEqual([]);
    });

    await test.step("Activate only after the published count reload; discover city and venue through fresh anonymous GET forms", async () => {
      await setCityStatus(page, owned, "active");
      await expect(field(page, "City URL slug")).toBeDisabled();
      // New anonymous context, not reused admin cookies or a stale draft-page cache.
      const publicScope = await isolatedContext(browser, width, safe);
      scopes.push(publicScope);
      const publicPage = await publicScope.context.newPage();
      const venuePath = `${CITY_PATH}/vivah-bhawan/${owned.venueSlug}`;
      await visitPublic(publicPage, CITY_PATH, 200, safe);
      await expect(publicPage.locator('link[rel="canonical"]')).toHaveAttribute("href", `${INTEGRATION_ORIGIN}${CITY_PATH}`);
      await expect(publicPage.getByRole("heading", { name: "1 venue to explore", exact: true })).toBeVisible();
      await expect(publicPage.getByRole("navigation", { name: "Breadcrumb", exact: true })).toContainText("Chapra");
      await expect(venueNames(publicPage)).toHaveText([owned.venueName]);
      const cover = owned.cityPhotos[0];
      await loadedImage(publicPage.getByRole("region", { name: "Photographs of Chapra", exact: true }).getByRole("img", { name: cover.alt_text, exact: true }));
      await assertImageResponse(await publicPage.request.get(`/media/${cover.id}/480`, API), false);
      const rows = checked(await anonymous.from("venues").select("id,city_id,status").eq("id", owned.venueId!), "Anonymous REST published inventory");
      expect(rows).toEqual([{ id: owned.venueId, city_id: owned.cityId, status: "published" }]);

      await visitPublic(publicPage, "/", 200, safe);
      await publicCitySuggestions(publicPage, "ChAp Bi", true, safe);
      await publicCitySuggestions(ordinaryPage, "haza", false, safe);
      const cityInput = publicPage.getByRole("combobox", { name: "Where are you celebrating?", exact: true });
      const [suggested] = await Promise.all([
        publicPage.waitForResponse((value) => {
          const url = new URL(value.url());
          return url.pathname === "/api/cities/suggestions" && url.searchParams.get("q") === "ChAp Bi";
        }),
        cityInput.fill("ChAp Bi"),
      ]);
      expect(suggested.status()).toBe(200);
      safe(await suggested.text());
      const suggestion = publicPage.getByRole("option", { name: "Chapra, Bihar", exact: true });
      await expect(suggestion).toBeVisible();
      await expect(publicPage.getByRole("listbox", { name: "City suggestions", exact: true }).getByRole("option")).toHaveCount(1);
      await auditLayout(publicPage);
      await cityInput.press("ArrowDown");
      await expect(suggestion).toHaveAttribute("aria-selected", "true");
      await cityInput.press("Enter");
      await expect(publicPage).toHaveURL(`${INTEGRATION_ORIGIN}${CITY_PATH}`);
      // Preserve the separate native GET path; autocomplete is not mandatory.
      await visitPublic(publicPage, "/", 200, safe);
      await publicPage.getByRole("combobox", { name: "Where are you celebrating?", exact: true }).fill("ChAp Bi");
      const [citySearch] = await Promise.all([
        publicPage.waitForResponse((value) => value.request().isNavigationRequest() && new URL(value.url()).pathname === "/cities"),
        publicPage.getByRole("button", { name: "Find my city", exact: true }).click(),
      ]);
      expect(citySearch.request().method()).toBe("GET");
      expect(citySearch.status()).toBe(200);
      safe(await citySearch.text());
      await expect(publicPage).toHaveURL((url) => url.pathname === "/cities" && url.searchParams.get("q") === "ChAp Bi");
      await expect(publicPage.locator(".sh-city-card h3")).toHaveText(["Chapra"]);
      await expect(publicPage.locator(".sh-city-card")).toContainText("1 venue to explore");
      await publicPage.locator(".sh-city-card").getByRole("link").click();
      await expect(publicPage).toHaveURL(`${INTEGRATION_ORIGIN}${CITY_PATH}`);
      await publicPage.getByRole("searchbox", { name: "Find a venue in this city", exact: true }).fill(owned.token);
      await publicPage.getByRole("search").getByRole("button", { name: "Search", exact: true }).click();
      await expect(venueNames(publicPage)).toHaveText([owned.venueName]);
      await expect(publicPage.getByRole("heading", { name: "1 venue found", exact: true })).toBeVisible();

      let filters = await openFilters(publicPage);
      await filters.getByLabel("Guest count", { exact: true }).fill("400");
      await filters.getByLabel("Price basis", { exact: true }).selectOption("per_event");
      await filters.getByLabel("Maximum budget (₹)", { exact: true }).fill("12000");
      await filters.getByRole("checkbox", { name: "Parking", exact: true }).check();
      await filters.getByRole("checkbox", { name: "Accessible entry", exact: true }).check();
      await filters.getByRole("button", { name: "Apply filters", exact: true }).click();
      await expect(publicPage).toHaveURL((url) => url.searchParams.get("capacity") === "400" && url.searchParams.get("priceType") === "per_event" && url.searchParams.get("budget") === "12000");
      await expect(venueNames(publicPage)).toHaveText([owned.venueName]);
      const applied = new URL(publicPage.url()).searchParams;
      expect(applied.get("q")).toBe(owned.token);
      expect(applied.get("capacity")).toBe("400");
      expect(applied.get("priceType")).toBe("per_event");
      expect(applied.get("budget")).toBe("12000");
      expect(applied.getAll("facility").sort()).toEqual(["accessible_entry", "parking"]);
      filters = await openFilters(publicPage);
      await filters.getByLabel("Guest count", { exact: true }).fill("401");
      await filters.getByRole("button", { name: "Apply filters", exact: true }).click();
      await expect(publicPage).toHaveURL((url) => url.searchParams.get("capacity") === "401");
      await expect(publicPage.getByRole("heading", { name: "0 venues found", exact: true })).toBeVisible();
      await expect(venueNames(publicPage)).toHaveCount(0);
      filters = await openFilters(publicPage);
      await filters.getByLabel("Guest count", { exact: true }).fill("400");
      await filters.getByLabel("Maximum budget (₹)", { exact: true }).fill("9999");
      await filters.getByRole("button", { name: "Apply filters", exact: true }).click();
      await expect(publicPage).toHaveURL((url) => url.searchParams.get("capacity") === "400" && url.searchParams.get("budget") === "9999");
      await expect(publicPage.getByRole("heading", { name: "0 venues found", exact: true })).toBeVisible();
      await expect(venueNames(publicPage)).toHaveCount(0);
      filters = await openFilters(publicPage);
      await filters.getByLabel("Maximum budget (₹)", { exact: true }).fill("12000");
      await filters.getByRole("button", { name: "Apply filters", exact: true }).click();
      await expect(publicPage).toHaveURL((url) => url.searchParams.get("budget") === "12000");
      await expect(venueNames(publicPage)).toHaveText([owned.venueName]);
      // The UI exposes only positive facets. An unrecorded facility must still
      // exclude this row at the real anonymous SQL/RLS search boundary.
      const absentFacility = record(checked(await anonymous.rpc("search_venues", {
        p_city: owned.cityId!, p_facilities: ["parking", "ac"], p_page: 1, p_limit: 12,
      }), "Read-only missing-facility search"));
      safe(JSON.stringify(absentFacility));
      expect(absentFacility.total).toBe(0);
      expect(absentFacility.items).toEqual([]);
      await publicPage.getByLabel("Sort by", { exact: true }).selectOption("price");
      await publicPage.getByRole("button", { name: "Apply sort", exact: true }).click();
      await expect(publicPage).toHaveURL((url) => url.searchParams.get("sort") === "price" && url.searchParams.get("priceType") === "per_event");
      await expect(venueNames(publicPage)).toHaveText([owned.venueName]);
      await publicPage.getByRole("link", { name: `View ${owned.venueName} in Chapra`, exact: true }).click();
      await expect(publicPage).toHaveURL(`${INTEGRATION_ORIGIN}${venuePath}`);
      await visitPublic(publicPage, venuePath, 200, safe);
      await expect(publicPage.locator('link[rel="canonical"]')).toHaveAttribute("href", `${INTEGRATION_ORIGIN}${venuePath}`);
      await expect(publicPage.getByRole("navigation", { name: "Breadcrumb", exact: true }).getByRole("link", { name: "Chapra", exact: true })).toHaveAttribute("href", CITY_PATH);
      await expect(publicPage.locator(".sh-detail-facts")).toContainText("100–400 guests");
      await expect(publicPage.locator(".sh-detail-facts")).toContainText("₹10,000–₹30,000 per event");
      await expect(publicPage.locator(".sh-facility-grid")).toContainText("Parking");
      await expect(publicPage.locator(".sh-facility-grid")).toContainText("Accessible entry");
      const contacts = publicPage.getByRole("complementary", { name: "Venue contact and listing information", exact: true });
      await expect(contacts.getByRole("link", { name: /^Call the venue/ })).toHaveAttribute("href", "tel:+12025550123");
      await expect(contacts.getByRole("link", { name: /^Chat on WhatsApp/ })).toHaveAttribute("href", "https://wa.me/12025550123");
      // Assert hrefs only. Never place a call or navigate to WhatsApp.
      await exerciseGallery(publicPage, owned);
      for (const photo of owned.photos.slice(0, 2)) await assertImageResponse(await publicPage.request.get(`/media/${photo.id}/480`, API), false);
      const document = record(checked(await anonymous.rpc("venue_document", { p_id: owned.venueId! }), "Anonymous published document"));
      safe(JSON.stringify(document));
      expect(document).not.toHaveProperty("research");
      expect(document).not.toHaveProperty("source_notes");
      expect(document).toMatchObject({ id: owned.venueId, name: owned.venueName, phone: "+12025550123", capacity_min: 100, capacity_max: 400, price_type: "per_event" });
      await publicSitemap(anonymous, [CITY_PATH, venuePath], safe);
      const robots = await publicPage.request.get("/robots.txt", API);
      expect(robots.status()).toBe(200);
      const robotsText = await robots.text();
      safe(robotsText);
      expect(robotsText).toMatch(/^Disallow:\s*\/\s*$/im);
      expect(robotsText).not.toMatch(/^Sitemap:/im);
      // Local HTTP remains deliberately non-indexable; the sitemap route rejects
      // nonexistent partition 0. Do not weaken this to expect production indexing.
      expect((await publicPage.request.get("/sitemap/0.xml", API)).status()).toBe(404);
      await assertDenied(await ordinaryPage.request.get(`/api/admin/media/${owned.photos[1].id}?w=480`, API));
      await visitPublic(publicPage, "/search", 200, safe);
      await publicPage.getByRole("searchbox", { name: "Search across city guides", exact: true }).fill(owned.token);
      await publicPage.getByRole("search").getByRole("button", { name: "Search", exact: true }).click();
      await expect(publicPage).toHaveURL((url) => url.pathname === "/search" && url.searchParams.get("q") === owned.token);
      await expect(publicPage.getByRole("heading", { name: "1 venue found", exact: true })).toBeVisible();
      await expect(venueNames(publicPage)).toHaveText([owned.venueName]);
    });

    await test.step("Unpublish, remove discovery entries, republish, then hide a still-published venue by deactivating its city", async () => {
      const path = `${CITY_PATH}/vivah-bhawan/${owned.venueSlug}`;
      await setVenueStatus(page, owned, "unpublished");
      await visitPublic(visitor, path, 404, safe);
      await visitPublic(visitor, `/search?q=${owned.token}`, 200, safe);
      await expect(visitor.getByRole("heading", { name: "0 venues found", exact: true })).toBeVisible();
      await expect(venueNames(visitor)).toHaveCount(0);
      await visitPublic(visitor, CITY_PATH, 200, safe);
      await expect(visitor.getByRole("heading", { name: "0 venues to explore", exact: true })).toBeVisible();
      // An active but now-empty guide remains public until deliberately deactivated.
      await publicCitySuggestions(visitor, "Chap", true, safe);
      await assertWorkspaceCounts(page, 0, 0);
      await assertPreview(page, `${CITY_WORKSPACE}/preview`, "Chapra.", safe);
      await expect(venueNames(page)).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "No saved draft or published venues yet.", exact: true })).toBeVisible();
      expect((await visitor.request.get(`/media/${owned.photos[1].id}/480`, API)).status()).toBe(404);
      await publicSitemap(anonymous, [], safe);
      await setVenueStatus(page, owned, "published");
      await visitPublic(visitor, path, 200, safe);
      await publicSitemap(anonymous, [CITY_PATH, path], safe);
      await setCityStatus(page, owned, "inactive");
      await visitPublic(visitor, CITY_PATH, 404, safe);
      await visitPublic(visitor, path, 404, safe);
      await visitPublic(visitor, `/search?q=${owned.token}`, 200, safe);
      await expect(venueNames(visitor)).toHaveCount(0);
      await visitPublic(visitor, "/cities?q=Chapra", 200, safe);
      await expect(visitor.locator(".sh-city-card")).toHaveCount(0);
      await publicCitySuggestions(visitor, "Chap", false, safe);
      await publicCitySuggestions(page, "Chap", false, safe);
      expect((await visitor.request.get(`/media/${owned.cityPhotos[0].id}/480`, API)).status()).toBe(404);
      expect(checked(await observer.from("venues").select("status").eq("id", owned.venueId!).single(), "Venue stays published under an inactive city")?.status).toBe("published");
      expect(checked(await anonymous.from("venues").select("id").eq("id", owned.venueId!), "Anonymous REST hides inactive-city venues")).toEqual([]);
      expect(checked(await ordinary().from("venues").select("id").eq("id", owned.venueId!), "Ordinary Auth still respects public RLS")).toEqual([]);
      await assertSignedOut(ordinaryPage, `/admin/venues/${owned.venueId}/preview`);
      await assertDenied(await ordinaryPage.request.get(`/api/admin/media/${owned.photos[0].id}?w=480`, API));
      await publicSitemap(anonymous, [], safe);
    });

    await test.step("Delete only this run's unpublished venue and inactive city, drain all variants, preserve Hazaribag and sign out", async () => {
      await cleanupOwned(page, observer, owned);
      await visitPublic(visitor, CITY_PATH, 404, safe);
      await visitPublic(visitor, "/city/hazaribag", 404, safe);
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await expect(page).toHaveURL(`${INTEGRATION_ORIGIN}/admin/login`);
      await assertSignedOut(page, "/admin/cities/new");
      await assertSignedOut(page, `/admin/venues/${owned.venueId}`);
      await assertDenied(await page.request.get("/api/admin/city-catalog?q=Chapra&limit=12", API));
      // SSR clients are request-scoped. A client that refreshed earlier retains
      // an in-memory cookie overlay, so observe logout with a new real client.
      const signedOut = await browserSession(adminScope.context, env).auth.getUser();
      expect(signedOut.data.user === null).toBe(true);
      const cookies = await adminScope.context.cookies(INTEGRATION_ORIGIN);
      expect(cookies.some((cookie) => cookie.value && (cookie.name === ADMIN_COOKIE || cookie.name.startsWith(`${ADMIN_COOKIE}.`)))).toBe(false);
    });
  } finally {
    // Failures must not turn into broad service-role deletion. Retry the same UI
    // cleanup only for captured run-owned IDs; unknown/unconfirmed IDs stay put.
    if (!owned.cleanupComplete && (owned.cityId || owned.venueId || owned.citySaveStarted || owned.venueSaveStarted)) {
      try { await cleanupOwned(page, observer, owned); }
      catch {
        info.annotations.push({ type: "cleanup-required", description: `UI cleanup could not be confirmed. Inspect/reset only the isolated run. Captured city=${owned.cityId ?? "unconfirmed"}, venue=${owned.venueId ?? "unconfirmed"}; no unfamiliar records were deleted.` });
        expect.soft(false, "Run-owned cleanup could not be confirmed; do not rerun against leftover inventory").toBe(true);
      }
    }
    try {
      // Revoke the ordinary test session with real GoTrue; parent owns deletion
      // of both provisioned Auth identities and the disposable database itself.
      if (ordinaryEstablished) {
        const signout = await ordinary().auth.signOut({ scope: "local" });
        expect.soft(Boolean(signout.error), "Ordinary test session sign-out must succeed").toBe(false);
      }
      if (!page.isClosed() && await page.getByRole("button", { name: "Sign out", exact: true }).isVisible()) {
        await page.getByRole("button", { name: "Sign out", exact: true }).click();
        await expect(page).toHaveURL(`${INTEGRATION_ORIGIN}/admin/login`);
      }
      for (const scope of scopes) await scope.assertSafe();
    } finally {
      for (const scope of scopes) await scope.context.close();
    }
  }
});