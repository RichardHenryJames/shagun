/** Small public contract only. Never import the administrative geography catalog. */
export const CITY_SUGGESTION_LIMIT = 8;
export const CITY_SUGGESTION_QUERY_LIMIT = 100;
export type CitySuggestion = { name: string; slug: string; state: string };

export function validCitySuggestionQuery(value: unknown): value is string {
  return typeof value === "string" && value.length <= CITY_SUGGESTION_QUERY_LIMIT && !/\p{Cc}/u.test(value);
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function label(value: unknown): value is string {
  return typeof value === "string" && value.length >= 2 && value.length <= 100
    && value.trim() === value && !/\p{Cc}/u.test(value);
}

/** Validate before navigation; neither arbitrary hrefs nor extra/private fields are accepted. */
export function parseCitySuggestions(value: unknown): CitySuggestion[] | null {
  if (!record(value) || Object.keys(value).length !== 1 || !Object.hasOwn(value, "items") || !Array.isArray(value.items)
    || value.items.length > CITY_SUGGESTION_LIMIT) return null;
  const cities: CitySuggestion[] = [];
  const slugs = new Set<string>();
  for (const item of value.items) {
    if (!record(item) || Object.keys(item).length !== 3 || !["name", "slug", "state"].every((key) => Object.hasOwn(item, key))
      || !label(item.name) || !label(item.state)
      || typeof item.slug !== "string" || item.slug.length < 2 || item.slug.length > 90
      || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug) || slugs.has(item.slug)) return null;
    slugs.add(item.slug);
    cities.push({ name: item.name, slug: item.slug, state: item.state });
  }
  return cities;
}