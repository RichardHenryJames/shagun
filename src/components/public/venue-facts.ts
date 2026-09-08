import { formatDate, isStale } from "@/lib/format";
import type { PublicVenue } from "@/lib/types";

export function venueCheck(venue: Pick<PublicVenue, "verified_at" | "verification_status">) {
  const now = new Date();
  const timestamp = venue.verified_at ? Date.parse(venue.verified_at) : NaN;
  const validDate = Number.isFinite(timestamp) && timestamp <= now.getTime();
  const date = validDate ? formatDate(venue.verified_at) : null;
  return {
    date,
    dateTime: date ? venue.verified_at! : undefined,
    fresh: Boolean(date && venue.verification_status === "verified" && !isStale(venue.verified_at, now)),
  };
}

export function validContactPhone(value: string | null): string | null {
  return value && /^\+[1-9]\d{7,14}$/.test(value.trim()) ? value.trim() : null;
}

export function validContactEmail(value: string | null): string | null {
  return value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? value.trim() : null;
}