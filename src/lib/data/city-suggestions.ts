import "server-only";
import { CITY_SUGGESTION_LIMIT, parseCitySuggestions, validCitySuggestionQuery, type CitySuggestion } from "@/lib/city-suggestions";
import { fixtureMode, isConfigured } from "@/lib/config";
import { DataUnavailableError } from "@/lib/data/errors";
import { anonymousClient } from "@/lib/db/clients";

/** Same public active-city predicate as /cities, bounded at the SQL query itself. */
export async function getPublicCitySuggestions(query = ""): Promise<CitySuggestion[]> {
  if (!validCitySuggestionQuery(query)) throw new DataUnavailableError();
  let result: unknown;
  if (fixtureMode()) {
    const fixture = (await import("@/lib/testing/fixtures")).fixtureCities(query.trim());
    result = { items: fixture.items.slice(0, CITY_SUGGESTION_LIMIT) };
  } else {
    // The normal unconfigured preview has no public inventory, never invented choices.
    if (!isConfigured()) return [];
    const { data, error } = await anonymousClient().rpc("public_cities", {
      p_query: query.trim(), p_page: 1, p_limit: CITY_SUGGESTION_LIMIT,
    }).abortSignal(AbortSignal.timeout(5_000));
    if (error) throw new DataUnavailableError();
    result = data;
  }
  if (!result || typeof result !== "object" || !("items" in result) || !Array.isArray(result.items)
    || result.items.length > CITY_SUGGESTION_LIMIT) throw new DataUnavailableError();
  const projected = result.items.map((city: unknown) => {
    if (!city || typeof city !== "object" || !("status" in city) || city.status !== "active") throw new DataUnavailableError();
    return {
      name: "name" in city ? city.name : null,
      slug: "slug" in city ? city.slug : null,
      state: "state" in city ? city.state : null,
    };
  });
  const suggestions = parseCitySuggestions({ items: projected });
  if (suggestions === null) throw new DataUnavailableError();
  // No IDs, city metadata, image roots, editorial notes or private counts cross this boundary.
  return suggestions;
}