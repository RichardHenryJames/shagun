"use client";

export type AnalyticsEvent =
  | "city_viewed"
  | "venue_viewed"
  | "search_performed"
  | "filter_used"
  | "phone_clicked"
  | "whatsapp_clicked";

export interface AnalyticsContext { cityId: string; venueId?: string }

/** Best-effort aggregate events. Never send queries, contact values or persistent identifiers. */
export function trackEvent(event: AnalyticsEvent, { cityId, venueId }: AnalyticsContext): void {
  if (process.env.NEXT_PUBLIC_ANALYTICS_ENABLED !== "true" || typeof window === "undefined" || !cityId) return;

  const browser = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
  const legacyWindow = window as Window & { doNotTrack?: string };
  const doNotTrack = [browser.doNotTrack, browser.msDoNotTrack, legacyWindow.doNotTrack]
    .some((value) => value === "1" || value?.toLowerCase() === "yes");
  if (doNotTrack || browser.globalPrivacyControl) return;

  void fetch("/api/events", {
    method: "POST",
    mode: "same-origin",
    credentials: "omit",
    cache: "no-store",
    referrerPolicy: "no-referrer",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, cityId, ...(venueId ? { venueId } : {}) }),
  }).catch(() => { /* Analytics must never interrupt discovery or a contact action. */ });
}