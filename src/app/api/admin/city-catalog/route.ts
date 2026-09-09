import { freshAdminContext } from "@/lib/actions/shared";
import { catalogSummary, getCatalogStates, searchCityCatalogWithCount } from "@/lib/city-catalog";
import { DEFAULT_CATALOG_RESULTS, MAX_CATALOG_RESULTS, validCatalogQuery } from "@/lib/city-catalog-data";
import { isConfigured } from "@/lib/config";
import { HttpError, routeError } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: Request): Promise<Response> {
  try {
    // A deliberately unconfigured preview cannot establish an Auth session.
    // Report setup unavailability without constructing a client or returning data.
    if (!isConfigured()) throw new HttpError(503, "Administrator services are not configured.");
    // Always check managed Auth and the current active UUID allowlist, including
    // empty/invalid queries. No service-role reads or cached administrator context.
    await freshAdminContext();
    const parameters = new URL(request.url).searchParams;
    for (const key of ["q", "state", "limit"]) {
      if (parameters.getAll(key).length > 1) throw new HttpError(400, "Supply each search parameter once.");
    }
    const query = parameters.get("q") ?? "";
    const stateCode = parameters.get("state") || undefined;
    const rawLimit = parameters.get("limit");
    if (!validCatalogQuery(query)) throw new HttpError(400, "Use a search of at most 100 characters without control characters.");
    const states = getCatalogStates();
    if (stateCode && !states.some((state) => state.code === stateCode)) throw new HttpError(400, "Choose a state from the catalog.");
    if (rawLimit !== null && !/^[1-9]\d{0,3}$/.test(rawLimit)) throw new HttpError(400, "Use a positive whole-number result limit.");
    const limit = rawLimit === null ? DEFAULT_CATALOG_RESULTS : Math.min(Number(rawLimit), MAX_CATALOG_RESULTS);
    const result = searchCityCatalogWithCount(query, stateCode, limit);
    const { name, license, url } = catalogSummary.source;
    return Response.json({ ...result, states, source: { name, license, url } }, { headers });
  } catch (error) {
    const response = routeError(error);
    for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
    return response;
  }
}