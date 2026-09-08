import "server-only";
import snapshot from "../../data/geography/indian-cities.json";
import {
  cityCatalogSchema, createCityCatalogIndex, DEFAULT_CATALOG_RESULTS,
  type CatalogSearchResult, type CatalogState, type GeoCity,
} from "./city-catalog-data";

export type { CatalogSource, CatalogState, GeoCity } from "./city-catalog-data";

// Only this server-only boundary imports the local snapshot. No runtime network,
// database lookup, React cache, or import into a Client Component is involved.
const catalog = cityCatalogSchema.parse(snapshot);
const index = createCityCatalogIndex(catalog.cities);
export const catalogSummary = Object.freeze({
  version: catalog.version, country: "India" as const, countryCode: "IN" as const,
  cityCount: catalog.cities.length, stateCount: index.getStates().length,
  districtCount: new Set(catalog.cities.filter((city) => city.district !== null)
    .map((city) => `${city.stateCode}:${city.district}`)).size,
  citiesWithoutDistrictCount: catalog.cities.filter((city) => city.district === null).length,
  source: Object.freeze({ ...catalog.source, files: Object.freeze(catalog.source.files.map((file) => Object.freeze({ ...file }))) }),
});

export function searchCityCatalog(query: string, stateCode?: string, limit = DEFAULT_CATALOG_RESULTS): GeoCity[] {
  return index.search(query, stateCode, limit).items;
}

/** Count is all prefix matches, not just the bounded result page. */
export function searchCityCatalogWithCount(query: string, stateCode?: string, limit = DEFAULT_CATALOG_RESULTS): CatalogSearchResult {
  return index.search(query, stateCode, limit);
}

export function getCatalogCity(id: string): GeoCity | null { return index.getCity(id); }
export function getCatalogStates(): CatalogState[] { return index.getStates(); }