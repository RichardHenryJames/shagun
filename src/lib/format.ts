import { PRICE_TYPE_LABELS, STALE_DAYS, type PriceType } from "@/lib/types";

export function slugify(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90).replace(/-$/g, "");
}
export function formatNumber(value: number): string { return new Intl.NumberFormat("en-IN").format(value); }
export function formatPrice(min: number | null, max: number | null, basis: PriceType | null): string | null {
  const money = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
  if ((!min || min <= 0) && (!max || max <= 0)) return null;
  const label = min && max && min !== max ? `${money(min)}–${money(max)}` : min ? `From ${money(min)}` : `Up to ${money(max!)}`;
  return basis ? `${label} ${PRICE_TYPE_LABELS[basis]}` : label;
}
export function formatCapacity(min: number | null, max: number | null): string | null {
  if (!min && !max) return null;
  if (min && max && min !== max) return `${formatNumber(min)}–${formatNumber(max)} guests`;
  return max ? `Up to ${formatNumber(max)} guests` : `From ${formatNumber(min!)} guests`;
}
export function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(date);
}
export function isStale(verifiedAt: string | null, now = new Date()): boolean {
  return !verifiedAt || now.getTime() - new Date(verifiedAt).getTime() > STALE_DAYS * 86_400_000;
}
export function phoneHref(phone: string): string { return `tel:${phone.replace(/[^\d+]/g, "")}`; }
export function whatsappHref(phone: string): string { return `https://wa.me/${phone.replace(/\D/g, "")}`; }
export function cityPath(slug: string): string { return `/city/${encodeURIComponent(slug)}`; }
export function venuePath(citySlug: string, venueSlug: string): string { return `${cityPath(citySlug)}/vivah-bhawan/${encodeURIComponent(venueSlug)}`; }
export function photoUrl(id: string, width: 480 | 960 | 1600 = 960, preview = false): string {
  return preview ? `/api/admin/media/${id}?w=${width}` : `/media/${id}/${width}`;
}