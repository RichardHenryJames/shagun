import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { link, lstat, mkdir, open, rename, stat, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { unzipSync } from "fflate";
import {
  CATALOG_SOURCE, GEONAMES_FILES, cityCatalogSchema, parseGeoNamesCatalog,
  type CatalogSource, type CityCatalog,
} from "../src/lib/city-catalog-data";

export const MAX_ZIP_BYTES = 50 * 1024 * 1024;
export const MAX_SOURCE_FILE_BYTES = 100 * 1024 * 1024;
export const MAX_SNAPSHOT_BYTES = 5 * 1024 * 1024;
const OUTPUT = fileURLToPath(new URL("../data/geography/indian-cities.json", import.meta.url));
const INPUTS = [
  { key: "cities", name: "cities500.zip", url: GEONAMES_FILES.cities, limit: MAX_ZIP_BYTES },
  { key: "states", name: "admin1CodesASCII.txt", url: GEONAMES_FILES.states, limit: MAX_SOURCE_FILE_BYTES },
  { key: "districts", name: "admin2Codes.txt", url: GEONAMES_FILES.districts, limit: MAX_SOURCE_FILE_BYTES },
  { key: "countries", name: "countryInfo.txt", url: GEONAMES_FILES.countries, limit: MAX_SOURCE_FILE_BYTES },
] as const;

export type ImportOptions = { update: boolean; sourceDir?: string; retrievedAt?: string };

export function parseImportArguments(args: readonly string[]): ImportOptions {
  const options: ImportOptions = { update: false };
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (seen.has(argument)) throw new Error("Duplicate import option.");
    seen.add(argument);
    if (argument === "--update") { options.update = true; continue; }
    if (argument !== "--source-dir" && argument !== "--retrieved-at") throw new Error("Unknown import option.");
    const value = args[++index];
    if (!value || value.startsWith("--")) throw new Error("Missing import option value.");
    if (argument === "--source-dir") options.sourceDir = resolve(value);
    else options.retrievedAt = value;
  }
  if (options.retrievedAt && !options.sourceDir) throw new Error("Use --retrieved-at only when reproducing previously downloaded source files.");
  return options;
}

function isMissing(error: unknown): boolean {
  return error !== null && typeof error === "object" && "code" in error && error.code === "ENOENT";
}

/** This check happens before any downloads, and publication also uses no-clobber. */
export async function assertSnapshotWritable(path: string, update: boolean): Promise<void> {
  let existing;
  try { existing = await lstat(path); }
  catch (error) { if (isMissing(error)) return; throw error; }
  if (!existing.isFile() || existing.isSymbolicLink()) throw new Error("The snapshot target must be a regular file, not a link or directory.");
  if (!update) throw new Error("The city catalog already exists. Inspect source changes and use --update to replace it explicitly.");
}

/** Bounded even when Content-Length is absent, incorrect, or compressed by HTTP. */
export async function downloadSource(url: string, maxBytes: number): Promise<Uint8Array> {
  if (!INPUTS.some((input) => input.url === url && input.limit === maxBytes)) throw new Error("Unsupported GeoNames download.");
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(120_000) });
  const length = response.headers.get("content-length");
  if (!response.ok || !response.body || (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes))) {
    await response.body?.cancel();
    throw new Error("GeoNames download failed or exceeds its byte limit.");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { await reader.cancel(); throw new Error("GeoNames download exceeds its byte limit."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (!total) throw new Error("GeoNames returned an empty file.");
  return new Uint8Array(Buffer.concat(chunks, total));
}

async function localSource(path: string, maxBytes: number): Promise<Uint8Array> {
  const info = await stat(path);
  if (!info.isFile() || !info.size || info.size > maxBytes) throw new Error("Invalid or oversized local source file.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of createReadStream(path)) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.byteLength;
    if (total > maxBytes) throw new Error("Local source file exceeds its byte limit.");
    chunks.push(bytes);
  }
  return new Uint8Array(Buffer.concat(chunks, total));
}

/** Check central-directory sizes before fflate allocates synchronous output. */
export function extractCitiesFile(zip: Uint8Array): Uint8Array {
  if (!zip.byteLength || zip.byteLength > MAX_ZIP_BYTES) throw new Error("Invalid or oversized GeoNames ZIP.");
  const names = new Set<string>();
  let total = 0;
  const files = unzipSync(zip, { filter(file) {
    total += file.originalSize;
    if (names.has(file.name) || names.size >= 8 || !Number.isSafeInteger(file.originalSize)
      || file.originalSize < 0 || file.originalSize > MAX_SOURCE_FILE_BYTES || total > MAX_SOURCE_FILE_BYTES * 2) {
      throw new Error("Duplicate, invalid or oversized GeoNames ZIP entry.");
    }
    names.add(file.name);
    // Never extract archive paths to disk; only this exact expected member is read.
    return file.name === "cities500.txt";
  } });
  const cities = files["cities500.txt"];
  if (!cities?.byteLength || cities.byteLength > MAX_SOURCE_FILE_BYTES) throw new Error("Missing or oversized cities500.txt in GeoNames ZIP.");
  return cities;
}

function decodeSource(bytes: Uint8Array): string {
  if (!bytes.byteLength || bytes.byteLength > MAX_SOURCE_FILE_BYTES) throw new Error("Invalid or oversized GeoNames text file.");
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export async function loadGeoNamesCatalog(options: ImportOptions): Promise<CityCatalog> {
  const text: Record<string, string> = {};
  const files: CatalogSource["files"] = [];
  const retrievedAt = options.retrievedAt ?? new Date().toISOString();
  for (const input of INPUTS) {
    const bytes = options.sourceDir ? await localSource(join(options.sourceDir, input.name), input.limit)
      : await downloadSource(input.url, input.limit);
    files.push({ url: input.url, sha256: createHash("sha256").update(bytes).digest("hex") });
    text[input.key] = decodeSource(input.key === "cities" ? extractCitiesFile(bytes) : bytes);
  }
  return parseGeoNamesCatalog({ cities: text.cities, states: text.states, districts: text.districts, countries: text.countries },
    { ...CATALOG_SOURCE, retrievedAt, files });
}

/** Complete validated JSON, compact UTF-8, deterministic for identical inputs/date. */
export function serializeCatalog(catalog: CityCatalog): string {
  const json = `${JSON.stringify(cityCatalogSchema.parse(catalog))}\n`;
  if (Buffer.byteLength(json, "utf8") > MAX_SNAPSHOT_BYTES) throw new Error("City catalog exceeds the 5 MiB snapshot budget.");
  return json;
}

export async function writeCatalogSnapshot(path: string, catalog: CityCatalog, update = false): Promise<void> {
  await assertSnapshotWritable(path, update);
  const json = serializeCatalog(catalog);
  await mkdir(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.city-catalog-${randomUUID()}.tmp`);
  const handle = await open(temporary, "wx");
  try {
    try { await handle.writeFile(json, "utf8"); await handle.sync(); }
    finally { await handle.close(); }
    // Hard-link publication is exclusive: even a concurrent initial import cannot
    // overwrite a newly appeared file. --update uses atomic same-directory rename.
    await assertSnapshotWritable(path, update);
    if (update) await rename(temporary, path);
    else await link(temporary, path);
  } finally {
    try { await unlink(temporary); } catch (error) { if (!isMissing(error)) throw error; }
  }
}

async function main(): Promise<void> {
  const options = parseImportArguments(process.argv.slice(2));
  await assertSnapshotWritable(OUTPUT, options.update);
  const catalog = await loadGeoNamesCatalog(options);
  await writeCatalogSnapshot(OUTPUT, catalog, options.update);
  // Public provenance/counts only: no environment variables, Auth or DB access.
  console.log(JSON.stringify({
    cities: catalog.cities.length, states: new Set(catalog.cities.map((city) => city.stateCode)).size,
    citiesWithoutDistrict: catalog.cities.filter((city) => city.district === null).length,
    bytes: Buffer.byteLength(serializeCatalog(catalog)), source: catalog.source,
  }, null, 2));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  void main().catch(() => {
    // Do not echo arbitrary provider errors, input contents or environment values.
    console.error("City catalog import failed; no incomplete snapshot was published. Check source availability, limits and mappings; an existing snapshot requires --update.");
    process.exitCode = 1;
  });
}