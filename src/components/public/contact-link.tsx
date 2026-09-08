"use client";

import type { ReactNode } from "react";
import { trackEvent } from "@/lib/analytics";

export function ContactLink({ href, event, cityId, venueId, preview = false, external = false, className, children }: {
  href: string;
  event: "phone_clicked" | "whatsapp_clicked";
  cityId: string;
  venueId: string;
  preview?: boolean;
  external?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      className={className}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      onClick={() => { if (!preview) trackEvent(event, { cityId, venueId }); }}
    >
      {children}
      {external && <span className="sh-sr-only"> (opens in a new tab)</span>}
    </a>
  );
}