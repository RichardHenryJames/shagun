export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export const CITY_STATUSES = ["draft", "active", "inactive", "archived"] as const;
export const VENUE_STATUSES = ["draft", "published", "unpublished", "archived"] as const;
export const VERIFICATION_STATUSES = ["unverified", "verified", "needs_review"] as const;
export const VENUE_TYPES = ["vivah_bhawan", "banquet_hall", "community_hall", "wedding_lawn", "hotel", "resort"] as const;
export const PRICE_TYPES = ["per_day", "per_event", "per_plate"] as const;
export const FACILITY_CODES = ["ac", "parking", "rooms", "catering", "decoration", "kitchen", "power_backup", "lift", "accessible_entry"] as const;

export type CityStatus = (typeof CITY_STATUSES)[number];
export type VenueStatus = (typeof VENUE_STATUSES)[number];
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];
export type VenueType = (typeof VENUE_TYPES)[number];
export type PriceType = (typeof PRICE_TYPES)[number];
export type FacilityCode = (typeof FACILITY_CODES)[number];

export const VENUE_TYPE_LABELS: Record<VenueType, string> = {
  vivah_bhawan: "Vivah Bhawan", banquet_hall: "Banquet hall", community_hall: "Community hall",
  wedding_lawn: "Wedding lawn", hotel: "Hotel", resort: "Resort",
};
export const PRICE_TYPE_LABELS: Record<PriceType, string> = { per_day: "per day", per_event: "per event", per_plate: "per plate" };
export const FACILITY_LABELS: Record<FacilityCode, string> = {
  ac: "Air conditioning", parking: "Parking", rooms: "Guest rooms", catering: "Catering",
  decoration: "Decoration", kitchen: "Kitchen", power_backup: "Power backup", lift: "Lift", accessible_entry: "Accessible entry",
};

export interface City {
  id: string; name: string; slug: string; state: string; country: string;
  description: string | null; status: CityStatus; seo_title: string | null; seo_description: string | null;
  metadata: Json; launched_at: string | null; created_at: string; updated_at: string;
}

export interface Venue {
  id: string; city_id: string; name: string; slug: string; description: string | null;
  venue_type: VenueType; address: string | null; locality: string | null;
  phone: string | null; alternate_phone: string | null; whatsapp: string | null; email: string | null;
  capacity_min: number | null; capacity_max: number | null; price_min: number | null; price_max: number | null;
  price_type: PriceType | null; latitude: number | null; longitude: number | null;
  status: VenueStatus; verification_status: VerificationStatus; verified_at: string | null;
  published_at: string | null; seo_title: string | null; seo_description: string | null;
  created_at: string; updated_at: string;
}

export interface Photo {
  id: string; venue_id: string | null; city_id: string | null; storage_key: string;
  alt_text: string; credit: string | null; width: number; height: number;
  sort_order: number; is_cover: boolean; created_at: string;
}
export interface VenueResearch { venue_id: string; source_notes: string; reviewed_at: string | null; reviewed_by: string | null; updated_at: string }
export interface AdminUser { id: string; display_name: string; is_active: boolean; created_at: string }
export interface PublicVenue extends Venue { city: City; photos: Photo[]; facilities: FacilityCode[] }
export interface AdminVenue extends PublicVenue { research: VenueResearch | null }
export interface CitySummary extends City {
  published_count: number; total_count: number; draft_count: number; review_count: number; cover: Photo | null;
}
export interface SearchFilters {
  q: string; page: number; sort: "recent" | "name" | "capacity" | "price";
  capacity: number | null; budget: number | null; priceType: PriceType | null;
  type: VenueType | null; facilities: FacilityCode[];
}
export interface SearchResult { items: PublicVenue[]; total: number; page: number; pageSize: number }
export interface Facets { facilities: FacilityCode[]; venueTypes: VenueType[]; hasCapacity: boolean; priceTypes: PriceType[] }
export interface DashboardData {
  totalCities: number; activeCities: number; totalVenues: number; publishedVenues: number; draftVenues: number;
  reviewVenues: number; cities: CitySummary[]; recentVenues: PublicVenue[]; cleanupCount: number;
}
export interface ActionState { success?: boolean; message?: string; error?: string; fieldErrors?: Record<string, string[]> }
export type SearchParams = Record<string, string | string[] | undefined>;
export const PAGE_SIZE = 12;
export const ADMIN_PAGE_SIZE = 25;
export const STALE_DAYS = 90;