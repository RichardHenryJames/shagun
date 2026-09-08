// Hand-maintained contract for the checked-in SQL migrations. Regenerate with
// `npm run db:types -- --schema shagun` and review after schema changes.
import type { AdminUser, City, Json, Photo, Venue, VenueResearch } from "@/lib/types";
// Materialize interfaces as object types: PostgREST requires Record<string, unknown>.
// An unmaterialized interface makes its conditional GenericSchema resolve to never.
type DbRow<Row> = { [Key in keyof Row]: Row[Key] };
type Table<Row> = { Row: DbRow<Row>; Insert: Partial<DbRow<Row>>; Update: Partial<DbRow<Row>>; Relationships: [] };
export type Database = {
  shagun: {
    Tables: {
      cities: Table<City>; venues: Table<Venue>; media_assets: Table<Photo>; venue_research: Table<VenueResearch>;
      admin_users: Table<AdminUser>;
      facilities: Table<{ code: string; label: string; sort_order: number }>;
      venue_facilities: Table<{ venue_id: string; facility_code: string }>;
      storage_cleanup_jobs: Table<{ id: string; storage_key: string; created_at: string; ready_at: string }>;
      rate_limits: Table<{ key: string; hits: number; resets_at: string }>;
      analytics_daily: Table<{ day: string; event: string; city_id: string; venue_key: string; count: number }>;
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
      public_cities: { Args: { p_query?: string; p_page?: number; p_limit?: number }; Returns: Json };
      search_venues: { Args: { p_city?: string | null; p_query?: string; p_capacity?: number | null; p_budget?: number | null; p_price_type?: string | null; p_facilities?: string[]; p_type?: string | null; p_sort?: string; p_page?: number; p_limit?: number }; Returns: Json };
      city_facets: { Args: { p_city: string }; Returns: Json };
      sitemap_entries: { Args: { p_offset?: number; p_limit?: number }; Returns: Json };
      venue_document: { Args: { p_id: string }; Returns: Json };
      admin_dashboard: { Args: Record<string, never>; Returns: Json };
      admin_city_summaries: { Args: { p_query?: string; p_page?: number; p_limit?: number }; Returns: Json };
      admin_venues: { Args: { p_city?: string | null; p_query?: string; p_status?: string; p_page?: number }; Returns: Json };
      save_city: { Args: { p_data: Json; p_id?: string | null; p_expected?: string | null }; Returns: string };
      save_venue: { Args: { p_data: Json; p_id?: string | null; p_expected?: string | null }; Returns: string };
      delete_record: { Args: { p_kind: string; p_id: string; p_name: string; p_expected: string }; Returns: undefined };
      update_photo: { Args: { p_id: string; p_operation: string; p_alt?: string; p_credit?: string }; Returns: undefined };
      begin_media_upload: { Args: { p_key: string }; Returns: undefined };
      finalize_media_upload: { Args: { p_data: Json }; Returns: Json };
      consume_rate_limit: { Args: { p_key: string; p_limit: number; p_seconds: number }; Returns: boolean };
      record_event: { Args: { p_event: string; p_city: string; p_venue?: string | null }; Returns: undefined };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};