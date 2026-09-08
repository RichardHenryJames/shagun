import { z } from "zod";

// Pure contracts, source parsing and search; no snapshot import or I/O here.
// Runtime consumers use the server-only city-catalog module instead.
export const GEONAMES_FILES = {
  cities: "https://download.geonames.org/export/dump/cities500.zip",
  states: "https://download.geonames.org/export/dump/admin1CodesASCII.txt",
  districts: "https://download.geonames.org/export/dump/admin2Codes.txt",
  countries: "https://download.geonames.org/export/dump/countryInfo.txt",
} as const;
export const CATALOG_SOURCE = {
  name: "GeoNames", license: "CC BY 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  url: "https://www.geonames.org/",
} as const;
export const MAX_CATALOG_ALIASES = 64;
export const MAX_CATALOG_TEXT = 200;
export const MAX_CATALOG_QUERY = 100;
export const MAX_CATALOG_RESULTS = 25;
export const DEFAULT_CATALOG_RESULTS = 12;

const sourceId = /^[1-9]\d{0,14}$/;
const catalogId = /^geonames:[1-9]\d{0,14}$/;
const stateCodePattern = /^IN\.[A-Za-z0-9_-]{1,20}$/;
const cleanText = z.string().min(1).max(MAX_CATALOG_TEXT).refine(
  (value) => value === value.trim() && value === value.normalize("NFC") && !/\p{Cc}/u.test(value),
  "Use bounded, trimmed Unicode text without control characters.",
);

/** Accent/case folding is for matching only; never invent or rewrite aliases. */
export function foldCatalogText(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function suggestedCitySlug(name: string, geonamesId: string): string {
  const slug = name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90).replace(/-+$/g, "");
  return slug.length >= 2 ? slug : `geonames-${geonamesId}`;
}

export const geoCitySchema = z.strictObject({
  id: z.string().regex(catalogId), name: cleanText, state: cleanText,
  stateCode: z.string().regex(stateCodePattern), country: z.literal("India"), countryCode: z.literal("IN"),
  district: cleanText.nullable(), aliases: z.array(cleanText).min(1).max(MAX_CATALOG_ALIASES),
  suggestedSlug: z.string().min(2).max(90).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
}).superRefine((city, context) => {
  if (new Set(city.aliases).size !== city.aliases.length || !city.aliases.includes(city.name)) {
    context.addIssue({ code: "custom", path: ["aliases"], message: "Keep unique source aliases including the canonical name." });
  }
  if (city.suggestedSlug !== suggestedCitySlug(city.name, city.id.slice("geonames:".length))) {
    context.addIssue({ code: "custom", path: ["suggestedSlug"], message: "Derive the suggestion from the source name and ID." });
  }
});
export type GeoCity = z.infer<typeof geoCitySchema>;
export type CatalogState = { code: string; name: string };

const fileUrlSchema = z.enum([GEONAMES_FILES.cities, GEONAMES_FILES.states, GEONAMES_FILES.districts, GEONAMES_FILES.countries]);
export const catalogSourceSchema = z.strictObject({
  name: z.literal(CATALOG_SOURCE.name), license: z.literal(CATALOG_SOURCE.license),
  licenseUrl: z.literal(CATALOG_SOURCE.licenseUrl), url: z.literal(CATALOG_SOURCE.url),
  retrievedAt: z.iso.datetime(),
  files: z.array(z.strictObject({ url: fileUrlSchema, sha256: z.string().regex(/^[a-f0-9]{64}$/) })).min(3).max(4),
}).superRefine((source, context) => {
  const urls = new Set(source.files.map((file) => file.url));
  if (urls.size !== source.files.length || ![GEONAMES_FILES.cities, GEONAMES_FILES.states, GEONAMES_FILES.countries].every((url) => urls.has(url))) {
    context.addIssue({ code: "custom", path: ["files"], message: "Record each required source file once." });
  }
});
export type CatalogSource = z.infer<typeof catalogSourceSchema>;

export const cityCatalogSchema = z.strictObject({
  version: z.literal(1), source: catalogSourceSchema, cities: z.array(geoCitySchema).min(1).max(100_000),
}).superRefine((catalog, context) => {
  const ids = new Set<string>();
  const states = new Map<string, string>();
  for (const [index, city] of catalog.cities.entries()) {
    if (ids.has(city.id)) context.addIssue({ code: "custom", path: ["cities", index, "id"], message: "Duplicate GeoNames ID." });
    if (states.has(city.stateCode) && states.get(city.stateCode) !== city.state) {
      context.addIssue({ code: "custom", path: ["cities", index, "state"], message: "Inconsistent source state mapping." });
    }
    ids.add(city.id);
    states.set(city.stateCode, city.state);
  }
});
export type CityCatalog = z.infer<typeof cityCatalogSchema>;

type AdminDivision = { code: string; name: string; id: string };
type GeoNamesInput = { cities: string; states: string; countries: string; districts?: string };

function normalizedSourceText(value: string): string { return value.trim().normalize("NFC"); }
function compareText(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }

/** GeoNames admin codes, not an invented list or ISO subdivision conversion. */
function adminDivisions(text: string, level: 1 | 2): Map<string, AdminDivision> {
  const result = new Map<string, AdminDivision>();
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.startsWith("IN.")) continue;
    const fields = line.split("\t");
    const [code, name, asciiName, id] = fields;
    const validCode = level === 1 ? stateCodePattern.test(code) : /^IN\.[A-Za-z0-9_-]{1,20}\.[A-Za-z0-9_-]{1,80}$/.test(code);
    if (fields.length !== 4 || !validCode || !sourceId.test(id) || result.has(code)) {
      throw new Error(`Invalid or duplicate GeoNames admin${level} record at row ${index + 1}.`);
    }
    result.set(code, { code, name: cleanText.parse(normalizedSourceText(asciiName || name)), id });
  }
  return result;
}

function indianCountry(text: string): { code: "IN"; name: "India" } {
  const rows = text.split(/\r?\n/).filter((line) => line.startsWith("IN\t"));
  if (rows.length !== 1) throw new Error("The country source must contain exactly one IN record.");
  const fields = rows[0].split("\t");
  if (fields.length < 17 || fields[4] !== "India" || !sourceId.test(fields[16])) {
    throw new Error("Invalid GeoNames IN country record.");
  }
  return { code: "IN", name: fields[4] };
}

/** Keeps the ASCII and original source names first, then actual alternate names. */
function sourceAliases(asciiName: string, name: string, alternateNames: string): string[] {
  const values = new Set<string>();
  for (const raw of [asciiName, name, ...alternateNames.split(",")]) {
    const alias = normalizedSourceText(raw);
    // Omit oversized/invalid alternate names; never truncate one into a fake alias.
    if (cleanText.safeParse(alias).success) values.add(alias);
    if (values.size === MAX_CATALOG_ALIASES) break;
  }
  return [...values];
}

/** All IN/P rows present in cities500, including low-population admin seats. */
export function parseGeoNamesCatalog(input: GeoNamesInput, source: CatalogSource): CityCatalog {
  const country = indianCountry(input.countries);
  const states = adminDivisions(input.states, 1);
  const districts = adminDivisions(input.districts ?? "", 2);
  const ranked: Array<{ city: GeoCity; population: bigint }> = [];
  if (!states.size) throw new Error("The source contains no Indian state mappings.");
  for (const [index, line] of input.cities.split(/\r?\n/).entries()) {
    if (!line || line.startsWith("#")) continue;
    const fields = line.split("\t");
    if (fields[8] !== country.code || fields[6] !== "P") continue;
    if (fields.length !== 19 || !sourceId.test(fields[0]) || !/^\d+$/.test(fields[14])) {
      throw new Error(`Invalid GeoNames IN populated-place record at row ${index + 1}.`);
    }
    const state = states.get(`${fields[8]}.${fields[10]}`);
    // Do not silently drop a place or guess its state when a join fails.
    if (!state) throw new Error(`Missing GeoNames state mapping for place ${fields[0]}.`);
    const originalName = cleanText.parse(normalizedSourceText(fields[1]));
    const asciiName = normalizedSourceText(fields[2]);
    const name = cleanText.parse(asciiName || originalName);
    ranked.push({
      city: {
        id: `geonames:${fields[0]}`, name, state: state.name, stateCode: state.code,
        country: country.name, countryCode: country.code,
        district: districts.get(`${state.code}.${fields[11]}`)?.name ?? null,
        aliases: sourceAliases(asciiName, originalName, fields[3]), suggestedSlug: suggestedCitySlug(name, fields[0]),
      },
      population: BigInt(fields[14]),
    });
  }
  // Population is only a source-supplied ranking signal. It is not stored or sent
  // to the UI. Code-point tie breaks are deterministic across operating systems.
  ranked.sort((a, b) => a.population > b.population ? -1 : a.population < b.population ? 1
    : compareText(a.city.name, b.city.name) || compareText(a.city.stateCode, b.city.stateCode)
      || compareText(a.city.district ?? "", b.city.district ?? "") || compareText(a.city.id, b.city.id));
  return cityCatalogSchema.parse({ version: 1, source, cities: ranked.map(({ city }) => city) });
}

export function validCatalogQuery(query: string): boolean {
  return query.length <= MAX_CATALOG_QUERY && !/\p{Cc}/u.test(query);
}

function cloneCity(city: GeoCity): GeoCity { return { ...city, aliases: [...city.aliases] }; }
export type CatalogSearchResult = { items: GeoCity[]; total: number };

/** Pure, in-memory prefix index. Returned objects cannot mutate the authority. */
export function createCityCatalogIndex(cities: readonly GeoCity[]) {
  const byId = new Map<string, GeoCity>();
  const states = new Map<string, string>();
  const entries = cities.map((input, order) => {
    const city = cloneCity(input);
    if (byId.has(city.id)) throw new Error("Duplicate catalog ID.");
    byId.set(city.id, city);
    states.set(city.stateCode, city.state);
    const name = foldCatalogText(city.name);
    const names = [...new Set([city.name, ...city.aliases].map(foldCatalogText))];
    const words = [...new Set([...names, city.state, city.stateCode, city.district ?? ""]
      .flatMap((value) => foldCatalogText(value).split(" ")).filter(Boolean))];
    return { city, order, name, names, words };
  });
  const stateList = [...states].map(([code, name]) => ({ code, name }))
    .sort((a, b) => compareText(a.name, b.name) || compareText(a.code, b.code));
  return {
    getCity(id: string): GeoCity | null {
      const city = catalogId.test(id) ? byId.get(id) : undefined;
      return city ? cloneCity(city) : null;
    },
    getStates(): CatalogState[] { return stateList.map((state) => ({ ...state })); },
    search(query: string, stateCode?: string, limit = DEFAULT_CATALOG_RESULTS): CatalogSearchResult {
      if (!validCatalogQuery(query) || !Number.isInteger(limit) || limit < 1 || (stateCode && !states.has(stateCode))) return { items: [], total: 0 };
      const normalized = foldCatalogText(query);
      if (!normalized) return { items: [], total: 0 };
      const terms = normalized.split(" ");
      const matches: Array<{ city: GeoCity; score: number; order: number }> = [];
      for (const entry of entries) {
        if (stateCode && entry.city.stateCode !== stateCode) continue;
        if (!terms.every((term) => entry.words.some((word) => word.startsWith(term)))) continue;
        const score = entry.name === normalized ? 0 : entry.names.includes(normalized) ? 1
          : entry.name.startsWith(normalized) ? 2 : entry.names.some((name) => name.startsWith(normalized)) ? 3 : 4;
        matches.push({ city: entry.city, score, order: entry.order });
      }
      matches.sort((a, b) => a.score - b.score || a.order - b.order);
      return { items: matches.slice(0, Math.min(limit, MAX_CATALOG_RESULTS)).map(({ city }) => cloneCity(city)), total: matches.length };
    },
  };
}