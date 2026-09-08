export class DataUnavailableError extends Error {
  constructor() { super("The directory is temporarily unavailable. Please try again shortly."); this.name = "DataUnavailableError"; }
}

/** Never surface raw PostgreSQL, auth, research or storage diagnostics to visitors. */
export function safeMutationError(error: { code?: string; message?: string } | null): string {
  if (!error) return "The change could not be saved. Please try again.";
  if (error.message === "conflict") return "This record changed since you opened it, possibly after a photo update. Reload the page and review the latest version before saving again.";
  if (error.code === "23505") return "That URL slug already exists here. Choose a different slug.";
  if (error.code === "23503") return "This record is still linked to other inventory. Remove or archive those records first.";
  const messages: Record<string, string> = {
    city_needs_published_venue: "Publish at least one reviewed venue before activating this city.",
    city_has_venues: "This city contains venues and cannot be permanently deleted.",
    city_slug_locked: "This city's URL is locked because it has already launched.",
    venue_url_locked: "The venue URL and city cannot change after first publication.",
    publication_needs_review: "Add an address, source notes and editorial review before publishing.",
    verification_needs_review: "Verification requires source notes, editorial review and a valid check date.",
    media_limit: "The photo limit has been reached. A venue supports 24 photos and a city supports one cover.",
    forbidden: "Your admin access is no longer active. Sign in again or contact the administrator.",
  };
  return messages[error.message ?? ""] ?? "The change was not saved. Check the required fields, dates and publication rules, then try again.";
}