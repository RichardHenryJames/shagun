"use client";

import { useEffect, useRef } from "react";
import { trackEvent, type AnalyticsContext, type AnalyticsEvent } from "@/lib/analytics";

export function EventImpression({ event, cityId, venueId }: AnalyticsContext & { event: AnalyticsEvent }) {
  const lastSent = useRef<string | null>(null);
  useEffect(() => {
    const key = `${event}:${cityId}:${venueId ?? ""}`;
    if (lastSent.current === key) return;
    lastSent.current = key;
    trackEvent(event, { cityId, venueId });
  }, [event, cityId, venueId]);
  return null;
}