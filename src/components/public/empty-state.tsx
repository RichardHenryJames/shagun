import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ArchMotif } from "@/components/public/artwork";

export function EmptyState({
  eyebrow = "A THOUGHTFUL BEGINNING",
  title,
  description,
  href,
  linkLabel,
  compact = false,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  href?: string;
  linkLabel?: string;
  compact?: boolean;
}) {
  return (
    <div className={`sh-empty-state${compact ? " sh-empty-compact" : ""}`}>
      <ArchMotif className="sh-empty-art" />
      <div className="sh-empty-copy">
        <p className="sh-eyebrow">{eyebrow}</p>
        <h2 className="sh-section-title">{title}</h2>
        <p>{description}</p>
        {href && linkLabel && <Link className="sh-text-link" href={href}>{linkLabel} <ArrowRight size={17} aria-hidden="true" /></Link>}
      </div>
    </div>
  );
}