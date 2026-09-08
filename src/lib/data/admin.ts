import "server-only";
import { requireAdmin } from "@/lib/auth";
import { DataUnavailableError } from "@/lib/data/errors";
import type { AdminVenue, CitySummary, DashboardData, Photo, PublicVenue, VenueResearch } from "@/lib/types";

export async function getDashboard(): Promise<DashboardData> {
  const { client } = await requireAdmin();
  const { data, error } = await client.rpc("admin_dashboard", {});
  if (error || !data) throw new DataUnavailableError();
  return data as unknown as DashboardData;
}
export async function getAdminCities(query = "", page = 1): Promise<{ items: CitySummary[]; total: number }> {
  const { client } = await requireAdmin();
  const { data, error } = await client.rpc("admin_city_summaries", { p_query: query.slice(0, 100), p_page: Math.max(1, Math.min(1000, page)), p_limit: 25 });
  if (error || !data) throw new DataUnavailableError();
  return data as unknown as { items: CitySummary[]; total: number };
}
export async function getAdminCity(slug: string): Promise<CitySummary | null> {
  const { client } = await requireAdmin();
  const { data: city, error } = await client.from("cities").select("*").eq("slug", slug).maybeSingle();
  if (error) throw new DataUnavailableError();
  if (!city) return null;
  const counts = await Promise.all([
    client.from("venues").select("id", { count: "exact", head: true }).eq("city_id", city.id),
    client.from("venues").select("id", { count: "exact", head: true }).eq("city_id", city.id).eq("status", "published"),
    client.from("venues").select("id", { count: "exact", head: true }).eq("city_id", city.id).eq("status", "draft"),
    client.rpc("admin_venues", { p_city: city.id, p_status: "needs_review", p_page: 1 }),
    client.from("media_assets").select("*").eq("city_id", city.id).order("is_cover", { ascending: false }).limit(1),
  ]);
  if (counts.some((r) => r.error)) throw new DataUnavailableError();
  const review = counts[3].data as unknown as { total: number };
  return { ...city, total_count: counts[0].count ?? 0, published_count: counts[1].count ?? 0, draft_count: counts[2].count ?? 0, review_count: review.total, cover: counts[4].data?.[0] ?? null };
}
export async function getAdminVenues(options: { cityId?: string; q?: string; status?: string; page?: number } = {}): Promise<{ items: PublicVenue[]; total: number; page: number; pageSize: number }> {
  const { client } = await requireAdmin();
  const { data, error } = await client.rpc("admin_venues", { p_city: options.cityId ?? null, p_query: (options.q ?? "").slice(0, 100), p_status: options.status ?? "", p_page: Math.max(1, Math.min(1000, options.page ?? 1)) });
  if (error || !data) throw new DataUnavailableError();
  return data as unknown as { items: PublicVenue[]; total: number; page: number; pageSize: number };
}
export async function getAdminVenue(id: string): Promise<AdminVenue | null> {
  const { client } = await requireAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [document, research] = await Promise.all([
    client.rpc("venue_document", { p_id: id }),
    client.from("venue_research").select("*").eq("venue_id", id).maybeSingle(),
  ]);
  if (document.error || research.error) throw new DataUnavailableError();
  if (!document.data) return null;
  return { ...document.data as unknown as PublicVenue, research: research.data as VenueResearch | null };
}
export async function getAdminPhotos(owner: { cityId?: string; venueId?: string }): Promise<Photo[]> {
  const { client } = await requireAdmin();
  if (Boolean(owner.cityId) === Boolean(owner.venueId)) return [];
  const { data, error } = await client.from("media_assets").select("*").eq(owner.cityId ? "city_id" : "venue_id", owner.cityId ?? owner.venueId!).order("sort_order").order("id");
  if (error) throw new DataUnavailableError();
  return data ?? [];
}