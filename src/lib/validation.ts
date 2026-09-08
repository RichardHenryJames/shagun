import { z } from "zod";
import { CITY_STATUSES, FACILITY_CODES, PRICE_TYPES, VENUE_STATUSES, VENUE_TYPES, VERIFICATION_STATUSES, type SearchFilters, type SearchParams } from "@/lib/types";

const optionalText = (max: number) => z.preprocess((v) => v === "" || v == null ? null : v, z.string().trim().max(max).nullable());
const optionalNumber = (min: number, max: number, integer = false) => z.preprocess((v) => v === "" || v == null ? null : Number(v), (integer ? z.number().int() : z.number()).min(min).max(max).nullable());
export const slugSchema = z.string().min(2).max(90).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens.");
const phone = z.preprocess((v) => typeof v === "string" && v.trim() ? v.replace(/[\s()-]/g, "") : null, z.string().regex(/^\+[1-9]\d{7,14}$/, "Include the country code, for example +91 followed by the number.").nullable());
const email = z.preprocess((v) => v === "" || v == null ? null : v, z.email().max(254).nullable());
const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) => z.preprocess((v) => v === "" || v == null ? null : v, z.enum(values).nullable());
const date = z.preprocess((v) => v === "" || v == null ? null : v, z.string().refine((s) => !Number.isNaN(Date.parse(s)) && Date.parse(s) <= Date.now(), "Choose a valid date that is not in the future.").nullable());

export const citySchema = z.object({
  name: z.string().trim().min(2).max(100), slug: slugSchema, state: z.string().trim().min(2).max(100),
  country: z.string().trim().min(2).max(100).default("India"), description: optionalText(2000),
  seo_title: optionalText(70), seo_description: optionalText(180), status: z.enum(CITY_STATUSES),
  metadata: z.preprocess((v) => {
    if (typeof v !== "string") return v ?? {};
    try { return v.trim() ? JSON.parse(v) : {}; } catch { return null; }
  }, z.record(z.string().max(100), z.union([z.string().max(500), z.number(), z.boolean(), z.null()])).refine((v) => JSON.stringify(v).length <= 3000, "Keep metadata under 3 KB.")),
});

export const venueSchema = z.object({
  city_id: z.uuid(), name: z.string().trim().min(2).max(180), slug: slugSchema,
  description: optionalText(8000), venue_type: z.enum(VENUE_TYPES), locality: optionalText(150), address: optionalText(600),
  phone, alternate_phone: phone, whatsapp: phone, email,
  capacity_min: optionalNumber(1, 100000, true), capacity_max: optionalNumber(1, 100000, true),
  price_min: optionalNumber(1, 100000000), price_max: optionalNumber(1, 100000000), price_type: optionalEnum(PRICE_TYPES),
  latitude: optionalNumber(-90, 90), longitude: optionalNumber(-180, 180),
  status: z.enum(VENUE_STATUSES), verification_status: z.enum(VERIFICATION_STATUSES), verified_at: date,
  seo_title: optionalText(70), seo_description: optionalText(180),
  source_notes: z.string().trim().max(8000), reviewed: z.preprocess((v) => v === "on" || v === true || v === "true", z.boolean()),
  facilities: z.array(z.enum(FACILITY_CODES)).max(FACILITY_CODES.length).transform((v) => [...new Set(v)]),
}).superRefine((v, ctx) => {
  if (v.capacity_min && v.capacity_max && v.capacity_min > v.capacity_max) ctx.addIssue({ code: "custom", path: ["capacity_max"], message: "Maximum capacity must be at least the minimum." });
  if (v.price_min && v.price_max && v.price_min > v.price_max) ctx.addIssue({ code: "custom", path: ["price_max"], message: "Maximum price must be at least the minimum." });
  if ((v.price_min || v.price_max) && !v.price_type) ctx.addIssue({ code: "custom", path: ["price_type"], message: "Select the price basis so visitors can compare fairly." });
  if ((v.latitude == null) !== (v.longitude == null)) ctx.addIssue({ code: "custom", path: ["longitude"], message: "Enter both coordinates, or leave both empty." });
  if (v.verification_status === "verified" && (!v.verified_at || !v.source_notes.trim() || !v.reviewed)) ctx.addIssue({ code: "custom", path: ["verified_at"], message: "Verification needs a check date, source notes and editorial review." });
  if (v.status === "published" && (!v.address || !v.source_notes.trim() || !v.reviewed)) ctx.addIssue({ code: "custom", path: ["status"], message: "Before publishing, add an address and source notes, and confirm editorial review." });
});
export const loginSchema = z.object({ email: z.email().max(254), password: z.string().min(1).max(128) });
export const uuidSchema = z.uuid();
export const photoMetadataSchema = z.object({
  alt_text: z.string().trim().min(5).max(250), credit: z.string().trim().min(5).max(300),
});

function first(v: string | string[] | undefined): string { return Array.isArray(v) ? v[0] ?? "" : v ?? ""; }
export function parseSearchParams(params: SearchParams): SearchFilters {
  const positive = (v: string, max: number) => /^\d+$/.test(v) && Number(v) > 0 ? Math.min(Number(v), max) : null;
  const basis = z.enum(PRICE_TYPES).safeParse(first(params.priceType));
  const sort = z.enum(["recent", "name", "capacity", "price"]).safeParse(first(params.sort));
  const type = z.enum(VENUE_TYPES).safeParse(first(params.type));
  const values = Array.isArray(params.facility) ? params.facility : first(params.facility).split(",");
  return {
    q: first(params.q).trim().replace(/[\u0000-\u001f]/g, "").slice(0, 100), page: positive(first(params.page), 1000) ?? 1,
    sort: sort.success && (sort.data !== "price" || basis.success) ? sort.data : "recent",
    capacity: positive(first(params.capacity), 100000), budget: basis.success ? positive(first(params.budget), 100000000) : null,
    priceType: basis.success ? basis.data : null, type: type.success ? type.data : null,
    facilities: [...new Set(values)].filter((v): v is (typeof FACILITY_CODES)[number] => FACILITY_CODES.includes(v as (typeof FACILITY_CODES)[number])),
  };
}
export function filterParams(filters: SearchFilters, overrides: Partial<SearchFilters> = {}): URLSearchParams {
  const f = { ...filters, ...overrides };
  const result = new URLSearchParams();
  if (f.q) result.set("q", f.q);
  if (f.page > 1) result.set("page", String(f.page));
  if (f.sort !== "recent") result.set("sort", f.sort);
  if (f.capacity) result.set("capacity", String(f.capacity));
  if (f.budget && f.priceType) result.set("budget", String(f.budget));
  if (f.priceType) result.set("priceType", f.priceType);
  if (f.type) result.set("type", f.type);
  f.facilities.forEach((v) => result.append("facility", v));
  return result;
}
export function hasActiveFilters(f: SearchFilters): boolean { return Boolean(f.q || f.capacity || f.budget || f.priceType || f.type || f.facilities.length || f.sort !== "recent"); }