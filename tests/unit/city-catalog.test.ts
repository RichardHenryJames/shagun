import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import snapshot from "../../data/geography/indian-cities.json";
import {
  CATALOG_SOURCE, GEONAMES_FILES, MAX_CATALOG_ALIASES, MAX_CATALOG_QUERY, MAX_CATALOG_RESULTS,
  cityCatalogSchema, createCityCatalogIndex, foldCatalogText, geoCitySchema, parseGeoNamesCatalog,
  suggestedCitySlug, type CatalogSource, type GeoCity,
} from "@/lib/city-catalog-data";
import {
  catalogSummary, getCatalogCity, getCatalogStates, searchCityCatalog, searchCityCatalogWithCount,
} from "@/lib/city-catalog";
import {
  MAX_SNAPSHOT_BYTES, MAX_SOURCE_FILE_BYTES, MAX_ZIP_BYTES, assertSnapshotWritable,
  downloadSource, extractCitiesFile, loadGeoNamesCatalog, parseImportArguments, serializeCatalog, writeCatalogSnapshot,
} from "../../scripts/city-catalog-import";

const mocks = vi.hoisted(() => ({
  sessionClient: vi.fn<() => Promise<unknown>>(), serviceClient: vi.fn(), anonymousClient: vi.fn(),
  fetch: vi.fn<typeof fetch>(),
}));
vi.mock("@/lib/db/clients", () => ({
  sessionClient: mocks.sessionClient, serviceClient: mocks.serviceClient, anonymousClient: mocks.anonymousClient,
}));

// Real freshAdminContext/Auth/allowlist logic; only external clients are mocked.
import { GET } from "@/app/api/admin/city-catalog/route";

const CHAPRA = "geonames:1274353";
const HAZARIBAGH = "geonames:1270164";
const ADMIN_ID = "30000000-0000-4000-8000-000000000003";
const PRIVATE_ERROR = "unit-only-private-provider-detail";
const ADMIN = { id: ADMIN_ID, display_name: "Unit-only administrator", is_active: true, created_at: "2026-09-08T00:00:00Z" };
type AdminResult = { data: typeof ADMIN | null; error: unknown };

function makeSession() {
  const allowlist = {
    select: vi.fn(), eq: vi.fn(),
    maybeSingle: vi.fn<() => Promise<AdminResult>>().mockResolvedValue({ data: { ...ADMIN }, error: null }),
  };
  allowlist.select.mockReturnValue(allowlist);
  allowlist.eq.mockReturnValue(allowlist);
  const client = {
    auth: { getUser: vi.fn<() => Promise<{ data: { user: { id: string } | null }; error: unknown }>>()
      .mockResolvedValue({ data: { user: { id: ADMIN_ID } }, error: null }) },
    from: vi.fn((table: string) => {
      if (table !== "admin_users") throw new Error("A catalog read must not query inventory.");
      return allowlist;
    }),
    rpc: vi.fn(), storage: { from: vi.fn() },
  };
  return { client, allowlist };
}

let session: ReturnType<typeof makeSession>;
const temporaryDirectories: string[] = [];
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://unit-project.example.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "unit-test-only-publishable-key");
  session = makeSession();
  mocks.sessionClient.mockResolvedValue(session.client);
  mocks.fetch.mockImplementation(async () => { throw new Error("Real network access is forbidden in catalog unit tests."); });
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(async () => {
  expect(mocks.serviceClient).not.toHaveBeenCalled();
  expect(mocks.anonymousClient).not.toHaveBeenCalled();
  expect(session.client.rpc).not.toHaveBeenCalled();
  expect(session.client.storage.from).not.toHaveBeenCalled();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  for (const directory of temporaryDirectories.splice(0)) await rm(directory, { recursive: true, force: true });
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "shagun-city-catalog-unit-"));
  temporaryDirectories.push(directory);
  return directory;
}

// Deliberately synthetic TSV fixtures, used locally only and never in the master.
const UNIT_SOURCE: CatalogSource = {
  ...CATALOG_SOURCE, retrievedAt: "2026-09-08T00:00:00.000Z",
  files: Object.values(GEONAMES_FILES).map((url) => ({ url, sha256: "a".repeat(64) })),
};
const UNIT_STATES = "IN.QA\tUnit Original State\tUnit State\t900000001\nIN.QB\tOther Unit State\tOther Unit State\t900000002\n";
const UNIT_DISTRICTS = "IN.QA.D1\tUnit Original District\tUnit District\t900000003\n";
const UNIT_COUNTRY = "IN\tIND\t356\tIN\tIndia\tUnit-only capital\t0\t0\tAS\t.in\tINR\tUnit\t91\t\t\t\t900000004\t\t\n";
function unitRow(changes: Record<number, string> = {}): string {
  const columns = ["900000010", "Unit Hámlét", "Unit Hamlet", "Unit Alias,Unit Hámlét", "0", "0", "P", "PPL",
    "IN", "", "QA", "D1", "", "", "0", "", "0", "Asia/Kolkata", "2026-09-08"];
  for (const [column, value] of Object.entries(changes)) columns[Number(column)] = value;
  return columns.join("\t");
}
function unitCatalog(rows = [unitRow()], changes: { states?: string; districts?: string; countries?: string } = {}) {
  return parseGeoNamesCatalog({ cities: rows.join("\n"), states: UNIT_STATES, districts: UNIT_DISTRICTS, countries: UNIT_COUNTRY, ...changes }, UNIT_SOURCE);
}

describe("complete checked-in geography and observed source records", () => {
  it("validates every snapshot row, provenance, counts, unique ID and state association", () => {
    const parsed = cityCatalogSchema.parse(snapshot);
    // Broad coverage gates, not an assertion that cities500 is an exhaustive census.
    expect(parsed.cities.length).toBeGreaterThan(5_000);
    expect(getCatalogStates().length).toBeGreaterThanOrEqual(30);
    expect(new Set(parsed.cities.map((city) => city.id)).size).toBe(parsed.cities.length);
    expect(catalogSummary.cityCount).toBe(parsed.cities.length);
    expect(catalogSummary.stateCount).toBe(getCatalogStates().length);
    expect(catalogSummary.citiesWithoutDistrictCount).toBe(parsed.cities.filter((city) => city.district === null).length);
    expect(catalogSummary.districtCount).toBe(new Set(parsed.cities.filter((city) => city.district !== null)
      .map((city) => `${city.stateCode}:${city.district}`)).size);
    expect(catalogSummary.source).toEqual(parsed.source);
    expect(parsed.source.files.map((file) => file.url).sort()).toEqual(Object.values(GEONAMES_FILES).sort());
    const states = new Map(getCatalogStates().map((state) => [state.code, state.name]));
    for (const city of parsed.cities) {
      expect(city).toMatchObject({ country: "India", countryCode: "IN", state: states.get(city.stateCode) });
      expect(city.aliases).toContain(city.name);
      expect(city.aliases.length).toBeLessThanOrEqual(MAX_CATALOG_ALIASES);
      expect(Object.keys(city).sort()).toEqual(["id", "name", "state", "stateCode", "country", "countryCode", "district", "aliases", "suggestedSlug"].sort());
    }
    expect(parsed.cities.filter((city) => city.state === "Bihar").length).toBeGreaterThan(100);
    expect(parsed.cities.filter((city) => city.state === "Jharkhand").length).toBeGreaterThan(100);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("preserves the observed Chapra/Chhapra Bihar source ID, ASCII name and aliases", () => {
    expect(getCatalogCity(CHAPRA)).toMatchObject({
      id: CHAPRA, name: "Chapra", state: "Bihar", stateCode: "IN.34", country: "India", countryCode: "IN",
      district: "Saran", suggestedSlug: "chapra", aliases: expect.arrayContaining(["Chapra", "Chāpra", "Chhapra", "छपरा"]),
    });
    for (const query of ["Chapra", "Chhapra", "CHĀPRA", "छपरा"]) {
      expect(searchCityCatalog(query, "IN.34").map((city) => city.id)).toContain(CHAPRA);
    }
  });

  it("keeps Hazaribagh's ASCII default and genuine Hazaribag aliases, without a name exception", () => {
    expect(getCatalogCity(HAZARIBAGH)).toMatchObject({
      id: HAZARIBAGH, name: "Hazaribagh", state: "Jharkhand", stateCode: "IN.38", country: "India", countryCode: "IN",
      district: "Hazaribag", suggestedSlug: "hazaribagh",
      aliases: expect.arrayContaining(["Hazaribagh", "Hazāribāgh", "Hazaribag", "Hazārībāg"]),
    });
    expect(searchCityCatalog("Hazaribag", "IN.38")[0]?.id).toBe(HAZARIBAGH);
    expect(searchCityCatalog("  HAZĀRĪBĀG  ", "IN.38")[0]?.id).toBe(HAZARIBAGH);
  });

  it("keeps same-named places distinct by source ID, state and district", () => {
    const matches = searchCityCatalog("Chapra");
    expect(matches).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: CHAPRA, state: "Bihar", district: "Saran" }),
      expect.objectContaining({ id: "geonames:13156897", name: "Chapra", state: "Assam", district: "Karimganj" }),
    ]));
    expect(searchCityCatalog("Chapra", "IN.03").map((city) => city.id)).not.toContain(CHAPRA);
    expect(searchCityCatalog("Cha Bi").map((city) => city.id)).toContain(CHAPRA);
    expect(searchCityCatalog("Chapra Saran").map((city) => city.id)).toContain(CHAPRA);
    // Baihar has a genuine Bihar alias: free text must not silently become a
    // state filter. Only the separate source-code selection restricts the state.
    expect(getCatalogCity("geonames:1277776")?.aliases.map(foldCatalogText)).toContain("bihar");
    expect(searchCityCatalog("Bihar")).toContainEqual(expect.objectContaining({ id: "geonames:1277776", name: "Baihar", state: "Madhya Pradesh" }));
    const biharOnly = searchCityCatalogWithCount("Bihar", "IN.34");
    expect(biharOnly.items.every((city) => city.state === "Bihar")).toBe(true);
    expect(biharOnly.total).toBe(snapshot.cities.filter((city) => city.stateCode === "IN.34").length);
  });

  it("is compact deterministic UTF-8 and imports its snapshot only behind server-only", () => {
    const bytes = readFileSync(new URL("../../data/geography/indian-cities.json", import.meta.url));
    expect(bytes.byteLength).toBeLessThan(MAX_SNAPSHOT_BYTES);
    expect(serializeCatalog(cityCatalogSchema.parse(snapshot))).toBe(bytes.toString("utf8"));
    const boundary = readFileSync(new URL("../../src/lib/city-catalog.ts", import.meta.url), "utf8");
    expect(boundary).toMatch(/^import "server-only";/);
    expect(boundary).toContain("../../data/geography/indian-cities.json");
    expect(boundary).not.toMatch(/\bfetch\s*\(/);
    const pure = readFileSync(new URL("../../src/lib/city-catalog-data.ts", import.meta.url), "utf8");
    expect(pure).not.toMatch(/indian-cities\.json|node:fs|\bfetch\s*\(/);
  });
});

describe("bounded immutable prefix search", () => {
  it.each(["", "   ", "---", "%", "x".repeat(MAX_CATALOG_QUERY + 1), "Cha\u0000", "Cha\n"])("returns no choices for empty/invalid query %j", (query) => {
    expect(searchCityCatalogWithCount(query)).toEqual({ items: [], total: 0 });
  });

  it("has a default page of 12, a hard maximum of 25, and an uncapped matching count", () => {
    const result = searchCityCatalogWithCount("a", undefined, 999);
    expect(result.items).toHaveLength(MAX_CATALOG_RESULTS);
    expect(result.total).toBeGreaterThan(MAX_CATALOG_RESULTS);
    expect(searchCityCatalog("a")).toHaveLength(12);
    expect(searchCityCatalog("a", undefined, 1)).toHaveLength(1);
    for (const limit of [0, -1, 1.5, NaN, Infinity]) expect(searchCityCatalog("a", undefined, limit)).toEqual([]);
    expect(searchCityCatalog("a", "IN.not-a-real-state")).toEqual([]);
  });

  it("uses token prefixes rather than arbitrary substrings, folds Unicode, and ranks exact names first", () => {
    const small = unitCatalog([
      unitRow({ 0: "900000011", 1: "Unit Alphabet", 2: "Unit Alphabet", 14: "100" }),
      unitRow({ 1: "Unit Alpha", 2: "Unit Alpha", 3: "Unit Other alias", 14: "0" }),
    ]);
    const index = createCityCatalogIndex(small.cities);
    expect(index.search("unit alpha").items[0].name).toBe("Unit Alpha");
    expect(index.search("ALPH").items).toHaveLength(2);
    expect(index.search("lpha").items).toEqual([]);
    expect(index.search("other").items[0].name).toBe("Unit Alpha");
    expect(foldCatalogText("  CĪTY—STATE  ")).toBe("city state");
    expect(createCityCatalogIndex([]).search("a")).toEqual({ items: [], total: 0 });
  });

  it("does not permit caller mutation of authoritative city, alias, state or summary data", () => {
    const original = getCatalogCity(CHAPRA)!;
    const city = getCatalogCity(CHAPRA)!;
    city.state = "Unit-only tampered state";
    city.aliases.push("Unit-only invented alias");
    searchCityCatalog("Chapra", "IN.34")[0].name = "Unit-only renamed result";
    const states = getCatalogStates();
    states[0].name = "Unit-only renamed state";
    states.splice(1);
    expect(getCatalogCity(CHAPRA)).toEqual(original);
    expect(getCatalogStates()[0].name).not.toBe("Unit-only renamed state");
    expect(Object.isFrozen(catalogSummary.source.files[0])).toBe(true);
    expect(Object.isFrozen(catalogSummary.source.files)).toBe(true);
    expect(getCatalogCity("1274353")).toBeNull();
    expect(getCatalogCity("geonames:01274353")).toBeNull();
    expect(getCatalogCity("__proto__")).toBeNull();
    expect(getCatalogCity("geonames:999999999999999")).toBeNull();
    const inputs = unitCatalog().cities;
    const index = createCityCatalogIndex(inputs);
    inputs[0].name = "Unit-only changed input";
    expect(index.getCity("geonames:900000010")?.name).toBe("Unit Hamlet");
  });
});

describe("pure source joins and strict catalog validation", () => {
  it("imports every available IN/P row, derives names/codes from source joins, and retains zero-population seats", () => {
    const catalog = unitCatalog([
      unitRow(), unitRow({ 0: "900000011", 7: "PPLA4", 10: "QB", 11: "missing" }),
      unitRow({ 0: "900000012", 8: "NP", 9: "IN" }), unitRow({ 0: "900000013", 6: "A", 7: "ADM1" }),
    ]);
    expect(catalog.cities).toHaveLength(2);
    expect(catalog.cities.find((city) => city.id === "geonames:900000010")).toMatchObject({
      name: "Unit Hamlet", state: "Unit State", stateCode: "IN.QA", district: "Unit District",
      aliases: ["Unit Hamlet", "Unit Hámlét", "Unit Alias"], suggestedSlug: "unit-hamlet",
    });
    expect(catalog.cities.find((city) => city.id === "geonames:900000011")).toMatchObject({ state: "Other Unit State", stateCode: "IN.QB", district: null });
    expect(unitCatalog(undefined, { districts: "" }).cities[0].district).toBeNull();
    expect(catalog.cities.every((city) => !("population" in city) && !("latitude" in city) && !("longitude" in city))).toBe(true);
  });

  it("uses only actual supplied aliases, bounds them without truncation, and preserves both source names", () => {
    const tooLong = "z".repeat(201);
    const aliases = [" Unit Source Alias ", "Unit Source Alias", tooLong, "Unit\u0000invalid", ...Array.from({ length: 100 }, (_, index) => `Unit Alias ${index}`)];
    const city = unitCatalog([unitRow({ 3: aliases.join(",") })]).cities[0];
    expect(city.aliases.slice(0, 3)).toEqual(["Unit Hamlet", "Unit Hámlét", "Unit Source Alias"]);
    expect(city.aliases).toHaveLength(MAX_CATALOG_ALIASES);
    expect(city.aliases).not.toContain(tooLong);
    expect(city.aliases).not.toContain(tooLong.slice(0, 200));
    expect(city.aliases).not.toContain("Unit\u0000invalid");
    expect(unitCatalog([unitRow({ 2: "" })]).cities[0].name).toBe("Unit Hámlét");
  });

  it("ranks by the original integer population only, deterministically, without rounding or new claims", () => {
    const rows = [unitRow({ 14: "9007199254740992" }), unitRow({ 0: "900000011", 14: "9007199254740993" })];
    expect(unitCatalog(rows).cities.map((city) => city.id)).toEqual(["geonames:900000011", "geonames:900000010"]);
    expect(serializeCatalog(unitCatalog(rows))).toBe(serializeCatalog(unitCatalog([...rows].reverse())));
    const tied = [unitRow(), unitRow({ 0: "900000011" })];
    expect(serializeCatalog(unitCatalog(tied))).toBe(serializeCatalog(unitCatalog([...tied].reverse())));
    expect(suggestedCitySlug("Unit Long ".repeat(20), "900000010").length).toBeLessThanOrEqual(90);
    expect(suggestedCitySlug("क", "900000010")).toBe("geonames-900000010");
  });

  it("fails closed on missing/duplicate source mappings, IDs, malformed rows, and an empty India extract", () => {
    expect(() => unitCatalog([unitRow({ 10: "unknown" })])).toThrow(/Missing GeoNames state mapping/);
    expect(() => unitCatalog(undefined, { states: UNIT_STATES + UNIT_STATES })).toThrow(/duplicate/);
    expect(() => unitCatalog(undefined, { countries: UNIT_COUNTRY + UNIT_COUNTRY })).toThrow(/exactly one/);
    expect(() => unitCatalog(undefined, { countries: UNIT_COUNTRY.replace("India", "Unit Wrong Country") })).toThrow(/country record/);
    expect(() => unitCatalog([unitRow(), unitRow()])).toThrow(/Duplicate GeoNames ID/);
    expect(() => unitCatalog([unitRow({ 14: "not-a-population" })])).toThrow(/Invalid GeoNames IN/);
    expect(() => unitCatalog([unitRow().split("\t").slice(0, 18).join("\t")])).toThrow(/Invalid GeoNames IN/);
    expect(() => unitCatalog([unitRow({ 8: "NP" })])).toThrow();
    expect(() => createCityCatalogIndex([unitCatalog().cities[0], unitCatalog().cities[0]])).toThrow(/Duplicate/);
  });

  it.each([
    { id: "900000010" }, { id: 900000010 }, { stateCode: "QA" }, { countryCode: "NP" },
    { name: " Untrimmed " }, { district: "" }, { suggestedSlug: "invented-slug" },
    { aliases: ["Unit Hamlet", "Unit Hamlet"] }, { aliases: ["not the canonical source name"] },
    { population: 100 }, { latitude: 1 }, { status: "active" }, { reviewed: true },
  ])("rejects malformed or undeclared city fields: %j", (change) => {
    expect(geoCitySchema.safeParse({ ...unitCatalog().cities[0], ...change }).success).toBe(false);
  });

  it("rejects bad hashes, missing/duplicate source files, fake license and conflicting state labels", () => {
    const catalog = unitCatalog();
    for (const source of [
      { ...catalog.source, license: "public domain" },
      { ...catalog.source, files: [] },
      { ...catalog.source, files: Array(4).fill(catalog.source.files[0]) },
      { ...catalog.source, files: catalog.source.files.map((file) => ({ ...file, sha256: "bad" })) },
    ]) expect(cityCatalogSchema.safeParse({ ...catalog, source }).success).toBe(false);
    expect(cityCatalogSchema.safeParse({ ...catalog, cities: [catalog.cities[0], { ...catalog.cities[0], id: "geonames:900000099", state: "Unit Wrong State" }] }).success).toBe(false);
  });
});

describe("bounded download, synchronous ZIP and safe deterministic snapshot publication", () => {
  it("allows only the fixed HTTPS source URLs, forbids redirects, and checks byte headers", async () => {
    mocks.fetch.mockResolvedValue(new Response("unit source"));
    expect(new TextDecoder().decode(await downloadSource(GEONAMES_FILES.states, MAX_SOURCE_FILE_BYTES))).toBe("unit source");
    expect(mocks.fetch).toHaveBeenCalledWith(GEONAMES_FILES.states, expect.objectContaining({ redirect: "error", signal: expect.any(AbortSignal) }));
    await expect(downloadSource("https://other.example.test/", MAX_SOURCE_FILE_BYTES)).rejects.toThrow(/Unsupported/);
    for (const header of [String(MAX_ZIP_BYTES + 1), "-1", "not-a-length"]) {
      mocks.fetch.mockResolvedValue(new Response("unit", { headers: { "content-length": header } }));
      await expect(downloadSource(GEONAMES_FILES.cities, MAX_ZIP_BYTES)).rejects.toThrow(/byte limit/);
    }
    mocks.fetch.mockResolvedValue(new Response("", { status: 503 }));
    await expect(downloadSource(GEONAMES_FILES.cities, MAX_ZIP_BYTES)).rejects.toThrow(/download failed/);
  });

  it("cancels a streaming ZIP beyond 50 MiB even with an understated content length", async () => {
    const cancel = vi.fn();
    const chunk = new Uint8Array(1024 * 1024);
    let count = 0;
    mocks.fetch.mockResolvedValue(new Response(new ReadableStream<Uint8Array>({
      pull(controller) { if (++count <= 52) controller.enqueue(chunk); else controller.close(); }, cancel,
    }), { headers: { "content-length": "1" } }));
    await expect(downloadSource(GEONAMES_FILES.cities, MAX_ZIP_BYTES)).rejects.toThrow(/byte limit/);
    expect(cancel).toHaveBeenCalledOnce();
    mocks.fetch.mockResolvedValue(new Response(""));
    await expect(downloadSource(GEONAMES_FILES.cities, MAX_ZIP_BYTES)).rejects.toThrow(/empty/);
  });

  it("reads only the exact ZIP member and refuses oversized declared members before allocation", () => {
    const zip = zipSync({ "readme.txt": strToU8("unit-only readme"), "cities500.txt": strToU8(unitRow()) });
    expect(new TextDecoder().decode(extractCitiesFile(zip))).toBe(unitRow());
    expect(() => extractCitiesFile(zipSync({ "../cities500.txt": strToU8(unitRow()) }))).toThrow(/Missing/);
    expect(() => extractCitiesFile(strToU8("not a zip"))).toThrow();
    const bomb = zipSync({ "cities500.txt": strToU8("unit") });
    const view = new DataView(bomb.buffer, bomb.byteOffset, bomb.byteLength);
    for (let offset = 0; offset + 28 <= bomb.length; offset += 1) {
      if (view.getUint32(offset, true) === 0x02014b50) {
        view.setUint32(offset + 24, MAX_SOURCE_FILE_BYTES + 1, true);
        break;
      }
    }
    expect(() => extractCitiesFile(bomb)).toThrow(/oversized GeoNames ZIP entry/);
    expect(() => extractCitiesFile(new Uint8Array(MAX_ZIP_BYTES + 1))).toThrow(/oversized GeoNames ZIP/);
  });

  it("loads previously downloaded files without network and hashes their exact original bytes", async () => {
    const directory = await temporaryDirectory();
    const inputs = [
      ["cities500.zip", GEONAMES_FILES.cities, zipSync({ "cities500.txt": strToU8(unitRow()) })],
      ["admin1CodesASCII.txt", GEONAMES_FILES.states, strToU8(UNIT_STATES)],
      ["admin2Codes.txt", GEONAMES_FILES.districts, strToU8(UNIT_DISTRICTS)],
      ["countryInfo.txt", GEONAMES_FILES.countries, strToU8(UNIT_COUNTRY)],
    ] as const;
    for (const [name, , bytes] of inputs) await writeFile(join(directory, name), bytes);
    const catalog = await loadGeoNamesCatalog({ update: false, sourceDir: directory, retrievedAt: UNIT_SOURCE.retrievedAt });
    expect(catalog.cities).toEqual(unitCatalog().cities);
    expect(catalog.source.files).toEqual(inputs.map(([, url, bytes]) => ({ url, sha256: createHash("sha256").update(bytes).digest("hex") })));
    expect(catalog.source.retrievedAt).toBe(UNIT_SOURCE.retrievedAt);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("refuses existing files without --update and preserves a complete snapshot on validation failure", async () => {
    const path = join(await temporaryDirectory(), "catalog.json");
    const original = unitCatalog();
    const changed = unitCatalog([unitRow({ 0: "900000011" })]);
    await writeCatalogSnapshot(path, original);
    await expect(assertSnapshotWritable(path, false)).rejects.toThrow(/--update/);
    await expect(writeCatalogSnapshot(path, changed)).rejects.toThrow(/--update/);
    expect(await readFile(path, "utf8")).toBe(serializeCatalog(original));
    await expect(writeCatalogSnapshot(path, { ...changed, cities: [] }, true)).rejects.toThrow();
    expect(await readFile(path, "utf8")).toBe(serializeCatalog(original));
    await writeCatalogSnapshot(path, changed, true);
    expect(await readFile(path, "utf8")).toBe(serializeCatalog(changed));
  });

  it("publishes exclusively under concurrent initial imports and never leaves partial/temp files", async () => {
    const directory = await temporaryDirectory();
    const path = join(directory, "catalog.json");
    const catalogs = [unitCatalog(), unitCatalog([unitRow({ 0: "900000011" })])];
    const results = await Promise.allSettled(catalogs.map((catalog) => writeCatalogSnapshot(path, catalog)));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(catalogs.map(serializeCatalog)).toContain(await readFile(path, "utf8"));
    expect(await readdir(directory)).toEqual(["catalog.json"]);
    const folderTarget = join(directory, "folder");
    await mkdir(folderTarget);
    await expect(writeCatalogSnapshot(folderTarget, catalogs[0], true)).rejects.toThrow(/regular file/);
  });

  it("accepts explicit update/offline reproduction options and rejects ambiguous flags", () => {
    expect(parseImportArguments([])).toEqual({ update: false });
    expect(parseImportArguments(["--update"])).toEqual({ update: true });
    expect(parseImportArguments(["--source-dir", tmpdir(), "--retrieved-at", UNIT_SOURCE.retrievedAt])).toMatchObject({ update: false, retrievedAt: UNIT_SOURCE.retrievedAt });
    for (const args of [["--update", "--update"], ["--unknown"], ["--source-dir"], ["--source-dir", "--update"], ["--retrieved-at", UNIT_SOURCE.retrievedAt]]) {
      expect(() => parseImportArguments(args)).toThrow();
    }
  });
});

function request(parameters = ""): Request { return new Request(`https://shagun.example.test/api/admin/city-catalog${parameters}`); }
async function expectPrivateError(response: Response, status: number): Promise<void> {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  const body = await response.json();
  expect(body).toEqual({ error: expect.any(String) });
  expect(JSON.stringify(body)).not.toContain(PRIVATE_ERROR);
  expect(JSON.stringify(body)).not.toContain("GeoNames");
}

describe("private read-only admin catalog route", () => {
  it.each(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"])("returns a private setup 503 without %s before constructing a session", async (variable) => {
    vi.stubEnv(variable, "");
    for (const parameters of ["", "?q=Chapra", "?q=Chapra&limit=bad"]) {
      const response = await GET(request(parameters));
      await expectPrivateError(response.clone(), 503);
      expect(await response.json()).toEqual({ error: "Administrator services are not configured." });
    }
    expect(mocks.sessionClient).not.toHaveBeenCalled();
    expect(session.client.auth.getUser).not.toHaveBeenCalled();
    expect(session.client.from).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("denies anonymous access before query validation or allowlist/inventory lookup", async () => {
    session.client.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    for (const parameters of ["", "?q=Chapra", `?q=${"x".repeat(101)}&limit=bad`]) await expectPrivateError(await GET(request(parameters)), 401);
    expect(session.client.auth.getUser).toHaveBeenCalledTimes(3);
    expect(session.client.from).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("reauthorizes managed Auth and the active UUID allowlist on every request, including revocation", async () => {
    expect((await GET(request("?q=Chapra&state=IN.34"))).status).toBe(200);
    session.allowlist.maybeSingle.mockResolvedValue({ data: { ...ADMIN, is_active: false }, error: null });
    await expectPrivateError(await GET(request("?q=Chapra&state=IN.34")), 401);
    expect(session.client.auth.getUser).toHaveBeenCalledTimes(2);
    expect(session.client.from).toHaveBeenCalledTimes(2);
    expect(session.client.from).toHaveBeenCalledWith("admin_users");
    expect(session.allowlist.eq).toHaveBeenCalledWith("id", ADMIN_ID);
    expect(session.allowlist.eq).toHaveBeenCalledWith("is_active", true);
  });

  it("denies missing/mismatched administrators and Auth/provider errors without exposing details", async () => {
    for (const result of [
      { data: null, error: null }, { data: { ...ADMIN, id: "40000000-0000-4000-8000-000000000004" }, error: null },
      { data: { ...ADMIN }, error: { message: PRIVATE_ERROR } },
    ]) {
      session.allowlist.maybeSingle.mockResolvedValue(result);
      await expectPrivateError(await GET(request("?q=Chapra")), 401);
    }
    session.client.auth.getUser.mockResolvedValue({ data: { user: { id: ADMIN_ID } }, error: { message: PRIVATE_ERROR } });
    await expectPrivateError(await GET(request("?q=Chapra")), 401);
    mocks.sessionClient.mockRejectedValue(new Error(PRIVATE_ERROR));
    await expectPrivateError(await GET(request("?q=Chapra")), 500);
  });

  it("returns small state options, attribution and zero items/count for an empty search", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.json()).toEqual({ items: [], total: 0, states: getCatalogStates(),
      source: { name: "GeoNames", license: "CC BY 4.0", url: CATALOG_SOURCE.url } });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("serves bounded state-filtered real results and the total count without private/admin data", async () => {
    const response = await GET(request("?q=Cha&state=IN.34&limit=12"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.items).toEqual(searchCityCatalog("Cha", "IN.34"));
    expect(body.items.map((city: GeoCity) => city.id)).toContain(CHAPRA);
    expect(body.total).toBe(searchCityCatalogWithCount("Cha", "IN.34").total);
    expect(Object.keys(body).sort()).toEqual(["items", "total", "states", "source"].sort());
    expect(JSON.stringify(body)).not.toContain(ADMIN_ID);
    const large = await (await GET(request("?q=a&limit=9999"))).json();
    expect(large.items).toHaveLength(25);
    expect(large.total).toBeGreaterThan(25);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each([
    `?q=${"x".repeat(101)}`, "?q=Cha%00", "?q=Cha%0A", "?q=Cha&q=Patna", "?state=IN.34&state=IN.38",
    "?state=IN.999", "?limit=", "?limit=0", "?limit=-1", "?limit=1.5", "?limit=1e2", "?limit=10000", "?limit=2&limit=3",
  ])("returns private 400 for invalid/ambiguous parameters after authorization: %s", async (parameters) => {
    await expectPrivateError(await GET(request(parameters)), 400);
    expect(session.client.auth.getUser).toHaveBeenCalledOnce();
    expect(session.allowlist.maybeSingle).toHaveBeenCalledOnce();
  });
});