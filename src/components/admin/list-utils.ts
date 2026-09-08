import { VENUE_STATUSES, type SearchParams } from "@/lib/types";

export function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function readListQuery(params: SearchParams) {
  const rawPage = firstParam(params.page);
  const rawStatus = firstParam(params.status);
  return {
    q: firstParam(params.q).trim().replace(/[\u0000-\u001f]/g, "").slice(0, 100),
    page: /^\d+$/.test(rawPage) ? Math.max(1, Math.min(Number(rawPage), 1000)) : 1,
    status: VENUE_STATUSES.find((value) => value === rawStatus) ?? "",
  };
}

export function listHref(path: string, values: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "" && !(key === "page" && value === 1)) query.set(key, String(value));
  }
  return query.size ? `${path}?${query}` : path;
}