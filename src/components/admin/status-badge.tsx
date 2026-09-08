import type { CityStatus, VenueStatus, VerificationStatus } from "@/lib/types";

const labels: Record<CityStatus | VenueStatus | VerificationStatus, string> = {
  draft: "Draft", active: "Active", inactive: "Inactive", archived: "Archived",
  published: "Published", unpublished: "Unpublished", unverified: "Unverified",
  verified: "Verified", needs_review: "Needs review",
};

export function StatusBadge({ status }: { status: CityStatus | VenueStatus | VerificationStatus }) {
  const tone = ["active", "published", "verified"].includes(status) ? "positive"
    : status === "needs_review" ? "warning" : "neutral";
  return <span className={`a-badge a-badge--${tone}`}>{labels[status]}</span>;
}