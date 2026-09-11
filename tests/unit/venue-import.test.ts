import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { zipSync, strToU8, unzipSync } from "fflate";
import { FACILITY_CODES } from "@/lib/types";
import { VENUE_IMPORT_BATCH_ROWS, VENUE_IMPORT_HEADERS, VENUE_IMPORT_MAX_ROWS, mergeVenueImportBatch, venueImportReportSchema, venueImportRow } from "@/lib/venue-import";
import { createVenueWorkbook, parseVenueWorkbook } from "@/lib/venue-import-workbook";
import { venueSchema } from "@/lib/validation";

const mocks = vi.hoisted(() => ({ sessionClient: vi.fn(), serviceClient: vi.fn(), rateRpc: vi.fn(), revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ sessionClient: mocks.sessionClient, serviceClient: mocks.serviceClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath, revalidateTag: mocks.revalidateTag }));
import { GET, POST } from "@/app/api/admin/venue-import/route";

const CITY_ID = "10000000-0000-4000-8000-000000000001";
const row = { name: "Local QA venue", venue_type: "banquet_hall" };

describe("spreadsheet draft row contract", () => {
  it("generates a slug and permits incomplete, unreviewed drafts only", () => {
    expect(venueImportRow(row, CITY_ID)).toMatchObject({
      city_id: CITY_ID, name: row.name, slug: "local-qa-venue", venue_type: "banquet_hall",
      status: "draft", verification_status: "unverified", verified_at: null, reviewed: false,
      source_notes: "", phone: null, address: null, capacity_min: null, facilities: [],
    });
    expect(VENUE_IMPORT_MAX_ROWS).toBe(1000);
    expect(new Set(VENUE_IMPORT_HEADERS).size).toBe(VENUE_IMPORT_HEADERS.length);
  });

  it("retains all supported facts, SEO, facilities and private notes without a review stamp", () => {
    const fields = {
      ...row, slug: "local-qa-explicit", description: "Local QA public text", locality: "QA locality",
      address: "Local QA address", phone: "+12025550123", alternate_phone: "+12025550124", whatsapp: "+12025550125",
      email: "qa@example.invalid", capacity_min: "10", capacity_max: 100, price_min: "100.50", price_max: 200,
      price_type: "per_event", latitude: "-10.5", longitude: 30.5, seo_title: "QA title", seo_description: "QA summary",
      source_notes: "Local QA private notes\nSecond line", ...Object.fromEntries(FACILITY_CODES.map((code) => [code, "yes"])),
    };
    const result = venueImportRow(fields, CITY_ID);
    expect(result).toMatchObject({ ...row, slug: fields.slug, description: fields.description, locality: fields.locality,
      address: fields.address, phone: fields.phone, alternate_phone: fields.alternate_phone, whatsapp: fields.whatsapp,
      email: fields.email, capacity_min: 10, capacity_max: 100, price_min: 100.5, price_max: 200, price_type: "per_event",
      latitude: -10.5, longitude: 30.5, seo_title: fields.seo_title, seo_description: fields.seo_description,
      source_notes: fields.source_notes, facilities: [...FACILITY_CODES], reviewed: false });
    expect(result.description).not.toContain(result.source_notes);
  });

  it.each(["city_id", "id", "status", "verification_status", "verified_at", "reviewed", "reviewed_by", "photos", "unknown", "__proto__"])(
    "rejects the undeclared %s column", (key) => {
      expect(() => venueImportRow({ ...row, [key]: "injected" }, CITY_ID)).toThrow("not supported");
    },
  );

  it.each([
    { name: "" }, { venue_type: "" }, { phone: 12025550123 }, { phone: "2025550123" }, { email: "invalid" },
    { capacity_max: 0 }, { capacity_min: 2.5 }, { capacity_min: 100, capacity_max: 10 },
    { price_min: 100 }, { price_min: 200, price_max: 100, price_type: "per_day" },
    { latitude: 10 }, { latitude: 91, longitude: 10 }, { parking: "maybe" }, { ac: 1 },
    { capacity_max: true }, { capacity_max: "0x100" }, { capacity_max: "1,000" }, { price_min: Infinity },
    { description: { formula: "1+1", result: "QA" } }, { description: "bad\u0000text" }, { source_notes: "x".repeat(8001) },
  ])("rejects malformed or inconsistent spreadsheet values: %j", (fields) => {
    expect(() => venueImportRow({ ...row, ...fields }, CITY_ID)).toThrow();
  });

  it("treats blank optional numbers as unknown, and no facilities as unrecorded", () => {
    expect(venueImportRow({ ...row, capacity_min: "  ", phone: " ", ac: "NO", rooms: false, parking: " Yes " }, CITY_ID))
      .toMatchObject({ capacity_min: null, phone: null, facilities: ["parking"] });
  });
});

async function workbookBytes(rows: ExcelJS.CellValue[][], headers: string[] = ["name", "venue_type"]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Venues");
  sheet.addRow(headers);
  rows.forEach((values) => sheet.addRow(values));
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

describe("bounded Excel workbook and downloadable template", () => {
  it("round-trips a blank template with every header, text phones and dropdowns but no sample inventory", async () => {
    const bytes = await createVenueWorkbook();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Uint8Array.from(bytes).buffer);
    const sheet = workbook.getWorksheet("Venues")!;
    expect(sheet.getRow(1).values).toEqual([undefined, ...VENUE_IMPORT_HEADERS]);
    expect(sheet.getRow(2).getCell(VENUE_IMPORT_HEADERS.indexOf("phone") + 1).numFmt).toBe("@");
    expect(sheet.getRow(2).getCell(VENUE_IMPORT_HEADERS.indexOf("venue_type") + 1).dataValidation.type).toBe("list");
    expect(sheet.getRow(1001).getCell(VENUE_IMPORT_HEADERS.indexOf("phone") + 1).numFmt).toBe("@");
    expect(sheet.getRow(1001).getCell(VENUE_IMPORT_HEADERS.indexOf("venue_type") + 1).dataValidation.type).toBe("list");
    expect(workbook.worksheets.map((worksheet) => worksheet.name)).toEqual(["Venues", "Fields"]);
    expect(await parseVenueWorkbook(bytes, CITY_ID)).toMatchObject({ totalRows: 0, rows: [], issueCount: 1 });
    sheet.getRow(2).getCell(VENUE_IMPORT_HEADERS.indexOf("name") + 1).value = row.name;
    sheet.getRow(2).getCell(VENUE_IMPORT_HEADERS.indexOf("venue_type") + 1).value = row.venue_type;
    const filled = await parseVenueWorkbook(new Uint8Array(await workbook.xlsx.writeBuffer()), CITY_ID);
    expect(filled.issues).toEqual([]);
    expect(filled.rows[0].input).toMatchObject({ status: "draft", reviewed: false, city_id: CITY_ID });
  });

  it("accepts reordered/subset headers and blank rows, retaining Excel row numbers", async () => {
    const bytes = await workbookBytes([["hotel", "First local QA"], [], ["resort", "Second local QA"]], ["venue_type", "name"]);
    const result = await parseVenueWorkbook(bytes, CITY_ID);
    expect(result.issues).toEqual([]);
    expect(result.rows.map((entry) => entry.row)).toEqual([2, 4]);
    expect(result.totalRows).toBe(2);
  });

  it.each([
    ["name", "status"], ["name", "name", "venue_type"], ["name", "venue_type", "city_id"],
    ["name", "venue_type", "reviewed"], ["name", "venue_type", "photo_url"], ["name", ""],
  ])("rejects missing, duplicate and unsupported headers: %j", async (...headers) => {
    const result = await parseVenueWorkbook(await workbookBytes([[row.name, row.venue_type]], headers), CITY_ID);
    expect(result.issueCount).toBeGreaterThan(0);
    expect(result.rows).toEqual([]);
  });

  it("reports field and duplicate-slug errors without discarding valid rows", async () => {
    const result = await parseVenueWorkbook(await workbookBytes([
      [row.name, row.venue_type, null], ["local QA venue", "hotel", null], ["Other QA", "hotel", 0],
    ], ["name", "venue_type", "capacity_max"]), CITY_ID);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ row: 3, column: "slug" }), expect.objectContaining({ row: 4, column: "capacity_max" }),
    ]));
    expect(result.totalRows).toBe(3);
  });

  it.each([{ formula: "1+1", result: "QA formula" }, { error: "#VALUE!" }, new Date("2026-01-01")] satisfies ExcelJS.CellValue[])(
    "rejects formulas (even cached), error cells and dates", async (value) => {
      const result = await parseVenueWorkbook(await workbookBytes([[value, "hotel"]]), CITY_ID);
      expect(result.issues).toEqual([expect.objectContaining({ row: 2, column: "name", message: expect.stringContaining("plain values") })]);
    },
  );

  it("accepts display text from rich text and ordinary hyperlinks without using their targets", async () => {
    const result = await parseVenueWorkbook(await workbookBytes([[
      { richText: [{ text: "Local " }, { text: "QA venue" }] }, "hotel", { text: "qa@example.invalid", hyperlink: "mailto:qa@example.invalid" },
    ]], ["name", "venue_type", "email"]), CITY_ID);
    expect(result.issues).toEqual([]);
    expect(result.rows[0].input.email).toBe("qa@example.invalid");
  });

  it("accepts exactly 1000 venues and rejects the 1001st venue", async () => {
    const rows = Array.from({ length: 1000 }, (_, index) => [`Local QA ${index}`, "hotel"]);
    const result = await parseVenueWorkbook(await workbookBytes(rows), CITY_ID);
    expect(result.rows).toHaveLength(1000);
    expect(result.issues).toEqual([]);
    expect(result.rows.at(-1)?.row).toBe(1001);
    await expect(parseVenueWorkbook(await workbookBytes([...rows, ["Extra QA", "hotel"]]), CITY_ID)).rejects.toThrow("at most 1000");
  });

  it.each(["hidden rows", "hidden columns", "merged cells", "hidden sheet", "extra sheet", "distant rows"])("rejects %s", async (kind) => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Venues");
    sheet.addRow(["name", "venue_type"]);
    sheet.addRow([row.name, row.venue_type]);
    if (kind === "hidden rows") sheet.getRow(2).hidden = true;
    if (kind === "hidden columns") sheet.getColumn(1).hidden = true;
    if (kind === "merged cells") sheet.mergeCells("A2:B2");
    if (kind === "hidden sheet") sheet.state = "hidden";
    if (kind === "extra sheet") workbook.addWorksheet("More venues");
    if (kind === "distant rows") sheet.getRow(1002).getCell(1).value = "Local QA";
    const result = parseVenueWorkbook(new Uint8Array(await workbook.xlsx.writeBuffer()), CITY_ID);
    if (kind.startsWith("hidden ") && kind !== "hidden sheet") expect((await result).issueCount).toBeGreaterThan(0);
    else await expect(result).rejects.toThrow();
  });

  it.each([new Uint8Array(), strToU8("name,venue_type\nQA,hotel"), new Uint8Array(2 * 1024 * 1024 + 1), new Uint8Array([0x50, 0x4b, 3, 4, 0])])(
    "rejects empty, wrong-format, oversized and truncated files", async (bytes) => {
      await expect(parseVenueWorkbook(bytes, CITY_ID)).rejects.toThrow();
    },
  );

  it.each(["xl/vbaProject.bin", "xl/media/image1.png", "xl/externalLinks/externalLink1.xml", "../escape.xml"])("rejects unsupported archive part %s", async (name) => {
    const parts = unzipSync(await workbookBytes([[row.name, row.venue_type]]));
    parts[name] = strToU8("unsupported");
    await expect(parseVenueWorkbook(zipSync(parts), CITY_ID)).rejects.toThrow();
  });

  it("bounds actual decompressed bytes and rejects XML entity declarations", async () => {
    const parts = unzipSync(await workbookBytes([[row.name, row.venue_type]]));
    parts["xl/sharedStrings.xml"] = strToU8("x".repeat(8 * 1024 * 1024));
    await expect(parseVenueWorkbook(zipSync(parts), CITY_ID)).rejects.toThrow("expanded workbook");
    parts["xl/sharedStrings.xml"] = strToU8('<!DOCTYPE root [<!ENTITY injected "bad">]><root/>');
    await expect(parseVenueWorkbook(zipSync(parts), CITY_ID)).rejects.toThrow("entities");
  });
});

const ADMIN_ID = "30000000-0000-4000-8000-000000000003";
const VENUE_ID = "20000000-0000-4000-8000-000000000001";
const OTHER_CITY_ID = "10000000-0000-4000-8000-000000000002";
const PRIVATE_DETAIL = "private-provider-detail-never-for-the-response";
const SAVED_CITY = { id: CITY_ID, name: "Local QA city", slug: "local-qa-city" };
const ADMIN = { id: ADMIN_ID, is_active: true, display_name: "Local QA admin" };
const ORIGIN = "http://localhost:3000";
type QueryResult = { data: unknown; error: unknown };

function query(result: () => QueryResult) {
  const builder = {
    select: vi.fn(), eq: vi.fn(), in: vi.fn(), maybeSingle: vi.fn(), abortSignal: vi.fn(),
    then: (resolve: (value: QueryResult) => unknown, reject?: (error: unknown) => unknown) => Promise.resolve().then(result).then(resolve, reject),
  };
  for (const method of [builder.select, builder.eq, builder.in, builder.maybeSingle, builder.abortSignal]) method.mockReturnValue(builder);
  return builder;
}

function makeImportSession() {
  const stored = new Map<string, { id: string; input: ReturnType<typeof venueImportRow> }>();
  const state = { admin: { data: ADMIN, error: null } as QueryResult, city: { data: SAVED_CITY, error: null } as QueryResult,
    lookupError: null as unknown, saves: [] as (QueryResult | null)[] };
  const adminQuery = query(() => state.admin);
  const cityQuery = query(() => state.city);
  const venueQuery = query(() => {
    const city = venueQuery.eq.mock.calls.at(-1)?.[1];
    const slugs = new Set(venueQuery.in.mock.calls.at(-1)?.[1]);
    return { data: [...stored.values()].filter((venue) => venue.input.city_id === city && slugs.has(venue.input.slug))
      .map((venue) => ({ id: venue.id, slug: venue.input.slug })), error: state.lookupError };
  });
  const client = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: ADMIN_ID } }, error: null }) },
    from: vi.fn((table: string) => {
      if (table === "admin_users") return adminQuery;
      if (table === "cities") return cityQuery;
      if (table === "venues") return venueQuery;
      throw new Error("Unexpected table access");
    }),
    rpc: vi.fn((name: string, args: { p_id: unknown; p_expected: unknown; p_data: unknown }) => query(() => {
      expect(name).toBe("save_venue");
      expect(args.p_id).toBeNull();
      expect(args.p_expected).toBeNull();
      const planned = state.saves.shift();
      if (planned) return planned;
      const input = venueSchema.parse(args.p_data);
      const key = `${input.city_id}:${input.slug}`;
      if (stored.has(key)) return { data: null, error: { code: "23505", message: PRIVATE_DETAIL } };
      const id = `20000000-0000-4000-8000-${String(stored.size + 1).padStart(12, "0")}`;
      stored.set(key, { id, input });
      return { data: id, error: null };
    })),
  };
  return { state, client, stored, adminQuery, cityQuery, venueQuery };
}

function importRequest(bytes: Uint8Array, mode = "validate", digest?: string, values: Record<string, string> = {}) {
  const form = new FormData();
  form.set("file", new Blob([Uint8Array.from(bytes)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "local-qa.xlsx");
  form.set("city_id", CITY_ID);
  form.set("mode", mode);
  if (digest) form.set("digest", digest);
  Object.entries(values).forEach(([key, value]) => form.set(key, value));
  return new Request(`${ORIGIN}/api/admin/venue-import`, { method: "POST", headers: { Origin: ORIGIN, "Sec-Fetch-Site": "same-origin" }, body: form });
}

let session: ReturnType<typeof makeImportSession>;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", ORIGIN);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://unit.example.invalid");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "unit-only-public-key");
  vi.stubEnv("RATE_LIMIT_SECRET", "unit-only-import-budget-key-not-a-real-secret");
  session = makeImportSession();
  mocks.sessionClient.mockResolvedValue(session.client);
  mocks.rateRpc.mockResolvedValue({ data: true, error: null });
  mocks.serviceClient.mockReturnValue({ rpc: mocks.rateRpc });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("authenticated city-scoped workbook endpoint", () => {
  it("downloads a private, noindex template only for a saved city", async () => {
    const response = await GET(new Request(`${ORIGIN}/api/admin/venue-import?city_id=${CITY_ID}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-robots-tag")).toMatch(/noindex/);
    expect(response.headers.get("content-disposition")).toContain("shagun-local-qa-city-venue-template.xlsx");
    expect((await parseVenueWorkbook(new Uint8Array(await response.arrayBuffer()), CITY_ID)).totalRows).toBe(0);
    expect(session.client.rpc).not.toHaveBeenCalled();
    expect(session.client.auth.getUser).toHaveBeenCalledOnce();
  });

  it("guards missing configuration before constructing a client", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    for (const response of [await GET(new Request(`${ORIGIN}/api/admin/venue-import?city_id=${CITY_ID}`)), await POST(importRequest(new Uint8Array()))]) {
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
    expect(mocks.sessionClient).not.toHaveBeenCalled();
  });

  it("rejects cross-origin requests before Auth or workbook work", async () => {
    const request = importRequest(new Uint8Array());
    request.headers.set("origin", "https://elsewhere.invalid");
    expect((await POST(request)).status).toBe(403);
    expect(mocks.sessionClient).not.toHaveBeenCalled();
  });

  it.each(["signed out", "inactive", "other user", "provider failure"])("denies %s for templates and imports", async (kind) => {
    if (kind === "signed out") session.client.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    if (kind === "inactive") session.state.admin.data = { ...ADMIN, is_active: false };
    if (kind === "other user") session.state.admin.data = { ...ADMIN, id: OTHER_CITY_ID };
    if (kind === "provider failure") session.state.admin.error = { message: PRIVATE_DETAIL };
    const responses = [await GET(new Request(`${ORIGIN}/api/admin/venue-import?city_id=${CITY_ID}`)), await POST(importRequest(new Uint8Array()))];
    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(await response.text()).not.toContain(PRIVATE_DETAIL);
    }
    expect(session.cityQuery.select).not.toHaveBeenCalled();
    expect(session.client.rpc).not.toHaveBeenCalled();
    expect(mocks.rateRpc).not.toHaveBeenCalled();
  });

  it.each(["city_id=invalid", `city_id=${CITY_ID}&city_id=${CITY_ID}`, `city_id=${CITY_ID}&status=published`])("rejects malformed template parameters: %s", async (query) => {
    expect((await GET(new Request(`${ORIGIN}/api/admin/venue-import?${query}`))).status).toBe(400);
    expect(session.client.rpc).not.toHaveBeenCalled();
  });

  it("validates every row without writes, then imports atomic drafts after explicit confirmation", async () => {
    const bytes = await workbookBytes([[row.name, row.venue_type, "Private QA notes", "yes"]], ["name", "venue_type", "source_notes", "parking"]);
    const validation = venueImportReportSchema.parse(await (await POST(importRequest(bytes))).json());
    expect(validation).toMatchObject({ phase: "validated", totalRows: 1, created: 0, remaining: 1, issues: [] });
    expect(session.client.rpc).not.toHaveBeenCalled();
    const result = await POST(importRequest(bytes, "import", validation.digest));
    const report = venueImportReportSchema.parse(await result.json());
    expect(report).toMatchObject({ phase: "imported", created: 1, skipped: 0, remaining: 0 });
    expect(report.rows[0]).toMatchObject({ outcome: "created", id: VENUE_ID });
    expect(JSON.stringify(report)).not.toContain("Private QA notes");
    expect([...session.stored.values()][0].input).toMatchObject({ city_id: CITY_ID, status: "draft", verification_status: "unverified",
      verified_at: null, reviewed: false, facilities: ["parking"], source_notes: "Private QA notes" });
    expect(session.client.auth.getUser).toHaveBeenCalledTimes(2);
    expect(session.adminQuery.eq).toHaveBeenCalledWith("is_active", true);
    expect(mocks.revalidateTag).toHaveBeenCalled();
    expect(session.client.rpc).toHaveBeenCalledOnce();
  });

  it("rechecks allowlist membership when importing after a successful validation", async () => {
    const bytes = await workbookBytes([[row.name, row.venue_type]]);
    const validation = await (await POST(importRequest(bytes))).json();
    session.state.admin.data = null;
    expect((await POST(importRequest(bytes, "import", validation.digest))).status).toBe(401);
    expect(session.client.rpc).not.toHaveBeenCalled();
  });

  it("imports 1000 drafts in ten confirmed requests with bounded duplicate lookups", async () => {
    const bytes = await workbookBytes(Array.from({ length: 1000 }, (_, index) => [`Local QA ${index}`, "hotel", `qa-${"long-name-".repeat(8)}${index}`]), ["name", "venue_type", "slug"]);
    let progress = venueImportReportSchema.parse(await (await POST(importRequest(bytes))).json());
    expect(progress.rows).toHaveLength(1000);
    expect(session.client.rpc).not.toHaveBeenCalled();
    expect(session.venueQuery.in).toHaveBeenCalledTimes(20);
    for (let offset = 0; offset < 1000; offset += VENUE_IMPORT_BATCH_ROWS) {
      const response = await POST(importRequest(bytes, "import", progress.digest, { offset: String(offset) }));
      expect(response.status).toBe(200);
      const batch = venueImportReportSchema.parse(await response.json());
      expect(batch.rows).toHaveLength(100);
      expect(batch.created).toBe(100);
      progress = mergeVenueImportBatch(progress, batch);
      expect(progress.created).toBe(offset + 100);
      expect(progress.remaining).toBe(900 - offset);
      expect(() => mergeVenueImportBatch(progress, batch)).toThrow();
    }
    expect(progress).toMatchObject({ phase: "imported", nextOffset: null, created: 1000, skipped: 0, remaining: 0 });
    expect(progress.rows.every((entry) => entry.outcome === "created")).toBe(true);
    expect(session.stored.size).toBe(1000);
    expect(session.client.auth.getUser).toHaveBeenCalledTimes(11);
    expect(session.venueQuery.in.mock.calls.every((call) => call[1].length <= 50)).toBe(true);
    expect([...session.stored.values()].every(({ input }) => input.status === "draft" && input.verification_status === "unverified" && input.reviewed === false && input.verified_at === null)).toBe(true);
  }, 15_000);

  it("rechecks authorization between import batches", async () => {
    const bytes = await workbookBytes(Array.from({ length: 101 }, (_, index) => [`Local QA ${index}`, "hotel"]));
    const validation = venueImportReportSchema.parse(await (await POST(importRequest(bytes))).json());
    const first = venueImportReportSchema.parse(await (await POST(importRequest(bytes, "import", validation.digest))).json());
    expect(first).toMatchObject({ phase: "importing", created: 100, nextOffset: 100 });
    session.state.admin.data = null;
    expect((await POST(importRequest(bytes, "import", validation.digest, { offset: "100" }))).status).toBe(401);
    expect(session.stored.size).toBe(100);
  });

  it("preserves confirmed earlier batches when a later save fails", async () => {
    const bytes = await workbookBytes(Array.from({ length: 103 }, (_, index) => [`Local QA ${index}`, "hotel"]));
    const validation = venueImportReportSchema.parse(await (await POST(importRequest(bytes))).json());
    const first = venueImportReportSchema.parse(await (await POST(importRequest(bytes, "import", validation.digest))).json());
    const progress = mergeVenueImportBatch(validation, first);
    session.state.saves = [null, { data: null, error: { code: "", message: PRIVATE_DETAIL } }];
    const response = await POST(importRequest(bytes, "import", validation.digest, { offset: "100" }));
    expect(response.status).toBe(503);
    const result = mergeVenueImportBatch(progress, venueImportReportSchema.parse(await response.json()));
    expect(result).toMatchObject({ phase: "stopped", nextOffset: null, created: 101, remaining: 2 });
    expect(result.rows.slice(100).map((entry) => entry.outcome)).toEqual(["created", "unconfirmed", "not_attempted"]);
    expect(session.stored.size).toBe(101);
    expect(() => mergeVenueImportBatch(result, first)).toThrow();
  });

  it.each(["", "1", "-100", "100.0", "1e2", "1000", "10000", "NaN", "100"])("rejects invalid or out-of-range offset %s", async (offset) => {
    const bytes = await workbookBytes([[row.name, row.venue_type]]);
    const validation = await (await POST(importRequest(bytes))).json();
    expect((await POST(importRequest(bytes, "import", validation.digest, { offset }))).status).toBe(400);
    expect(session.client.rpc).not.toHaveBeenCalled();
  });

  it("rejects a validation offset and validates the last row before any first-batch save", async () => {
    const rows = Array.from({ length: 1000 }, (_, index) => [`Local QA ${index}`, index === 999 ? "invalid" : "hotel"]);
    const bytes = await workbookBytes(rows);
    expect((await POST(importRequest(bytes, "validate", undefined, { offset: "0" }))).status).toBe(400);
    const validation = await (await POST(importRequest(bytes))).json();
    expect(validation).toMatchObject({ phase: "invalid", totalRows: 1000 });
    expect((await POST(importRequest(bytes, "import", validation.digest))).status).toBe(422);
    expect(session.client.rpc).not.toHaveBeenCalled();
    expect(session.venueQuery.select).not.toHaveBeenCalled();
  });

  it.each(["city", "digest", "offset", "rows", "next offset", "row identity"])("rejects mismatched batch %s", async (kind) => {
    const bytes = await workbookBytes([[row.name, row.venue_type]]);
    const validation = venueImportReportSchema.parse(await (await POST(importRequest(bytes))).json());
    const batch = venueImportReportSchema.parse(await (await POST(importRequest(bytes, "import", validation.digest))).json());
    if (kind === "city") batch.cityId = OTHER_CITY_ID;
    if (kind === "digest") batch.digest = "a".repeat(64);
    if (kind === "offset") batch.offset = 100;
    if (kind === "rows") batch.rows = [];
    if (kind === "next offset") batch.nextOffset = 100;
    if (kind === "row identity") batch.rows[0].slug = "different-qa";
    expect(() => mergeVenueImportBatch(validation, batch)).toThrow();
  });

  it("rejects modified files, changed city, missing confirmation and extra form fields without writes", async () => {
    const bytes = await workbookBytes([[row.name, row.venue_type]]);
    const validation = await (await POST(importRequest(bytes))).json();
    const modified = await workbookBytes([["Different QA", row.venue_type]]);
    expect((await POST(importRequest(modified, "import", validation.digest))).status).toBe(409);
    expect((await POST(importRequest(bytes, "import"))).status).toBe(409);
    expect((await POST(importRequest(bytes, "validate", undefined, { status: "published" }))).status).toBe(400);
    session.state.city.data = { ...SAVED_CITY, id: OTHER_CITY_ID };
    expect((await POST(importRequest(bytes, "import", validation.digest, { city_id: OTHER_CITY_ID }))).status).toBe(409);
    expect(session.client.rpc).not.toHaveBeenCalled();
  });

  it("blocks the whole batch when any row fails validation", async () => {
    const bytes = await workbookBytes([[row.name, row.venue_type], ["Invalid QA", "invented-type"]]);
    const response = await POST(importRequest(bytes));
    const report = venueImportReportSchema.parse(await response.json());
    expect(response.status).toBe(422);
    expect(report.phase).toBe("invalid");
    expect(report.issues[0]).toMatchObject({ row: 3, column: "venue_type" });
    expect((await POST(importRequest(bytes, "import", report.digest))).status).toBe(422);
    expect(session.client.rpc).not.toHaveBeenCalled();
    expect(session.venueQuery.select).not.toHaveBeenCalled();
  });

  it.each(["draft", "published", "unpublished", "archived"] as const)("preserves existing %s venues and makes retries insert-only", async (status) => {
    const input = { ...venueImportRow(row, CITY_ID), status, description: "Existing edits" };
    session.stored.set(`${CITY_ID}:${input.slug}`, { id: VENUE_ID, input });
    const bytes = await workbookBytes([[row.name, row.venue_type], ["New local QA", "hotel"]]);
    const validation = await (await POST(importRequest(bytes))).json();
    const first = await (await POST(importRequest(bytes, "import", validation.digest))).json();
    expect(first).toMatchObject({ created: 1, skipped: 1, remaining: 0 });
    const retry = await (await POST(importRequest(bytes, "import", validation.digest))).json();
    expect(retry).toMatchObject({ created: 0, skipped: 2, remaining: 0 });
    expect(session.stored.get(`${CITY_ID}:${input.slug}`)?.input).toEqual(input);
    expect(session.client.rpc).toHaveBeenCalledOnce();
  });

  it("does not skip a matching slug in another city", async () => {
    const input = venueImportRow(row, OTHER_CITY_ID);
    session.stored.set(`${OTHER_CITY_ID}:${input.slug}`, { id: VENUE_ID, input });
    const bytes = await workbookBytes([[row.name, row.venue_type]]);
    const validation = await (await POST(importRequest(bytes))).json();
    expect((await (await POST(importRequest(bytes, "import", validation.digest))).json()).created).toBe(1);
    expect(session.venueQuery.eq).toHaveBeenCalledWith("city_id", CITY_ID);
    expect(session.stored.size).toBe(2);
  });

  it.each(["missing city", "lookup failure", "rate limit"])("stops before writes on %s", async (kind) => {
    const bytes = await workbookBytes([[row.name, row.venue_type]]);
    if (kind === "missing city") session.state.city.data = null;
    if (kind === "lookup failure") session.state.lookupError = { message: PRIVATE_DETAIL };
    if (kind === "rate limit") mocks.rateRpc.mockResolvedValue({ data: false, error: null });
    const response = await POST(importRequest(bytes));
    expect(response.status).toBe(kind === "missing city" ? 404 : kind === "rate limit" ? 429 : 503);
    expect(await response.text()).not.toContain(PRIVATE_DETAIL);
    expect(session.client.rpc).not.toHaveBeenCalled();
  });

  it("reports confirmed progress, SQL failure and untouched remaining rows separately", async () => {
    const bytes = await workbookBytes([["First QA", "hotel"], ["Second QA", "hotel"], ["Third QA", "hotel"]]);
    const validation = await (await POST(importRequest(bytes))).json();
    session.state.saves = [null, { data: null, error: { code: "42501", message: PRIVATE_DETAIL } }];
    const response = await POST(importRequest(bytes, "import", validation.digest));
    const report = venueImportReportSchema.parse(await response.json());
    expect(response.status).toBe(503);
    expect(report).toMatchObject({ phase: "stopped", created: 1, skipped: 0, remaining: 2 });
    expect(report.rows.map((entry) => entry.outcome)).toEqual(["created", "not_attempted", "not_attempted"]);
    expect(report.error).toMatch(/sign in again.*before retrying/i);
    expect(JSON.stringify(report)).not.toContain(PRIVATE_DETAIL);
    expect(session.client.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.revalidateTag).toHaveBeenCalled();
  });

  it.each([{ data: null, error: null }, { data: null, error: { code: "", message: PRIVATE_DETAIL } }])("keeps uncertain saves unconfirmed and refreshes possible progress", async (failure) => {
    const bytes = await workbookBytes([[row.name, row.venue_type]]);
    const validation = await (await POST(importRequest(bytes))).json();
    session.state.saves = [failure];
    const report = venueImportReportSchema.parse(await (await POST(importRequest(bytes, "import", validation.digest))).json());
    expect(report).toMatchObject({ phase: "stopped", created: 0, remaining: 1 });
    expect(report.rows[0].outcome).toBe("unconfirmed");
    expect(mocks.revalidateTag).toHaveBeenCalled();
    expect(JSON.stringify(report)).not.toContain(PRIVATE_DETAIL);
  });

  it("handles a concurrent unique-slug insert as a skip, not an overwrite", async () => {
    const bytes = await workbookBytes([[row.name, row.venue_type]]);
    const validation = await (await POST(importRequest(bytes))).json();
    session.state.saves = [{ data: null, error: { code: "23505", message: PRIVATE_DETAIL } }];
    const report = await (await POST(importRequest(bytes, "import", validation.digest))).json();
    expect(report).toMatchObject({ phase: "imported", created: 0, skipped: 1, remaining: 0 });
    expect(session.client.rpc).toHaveBeenCalledOnce();
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });
});