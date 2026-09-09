export const SITE_NAME = "Shagun";
export const SITE_DESCRIPTION = "Find Vivah Bhawans, marriage halls and wedding venues, city by city. Useful details, open contact information and no sign-up.";

export interface ConfigEnvironment {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  RATE_LIMIT_SECRET?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  VERCEL?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
}
export type ConfigIssue = "supabase-url" | "publishable-key" | "server-key" | "rate-limit-secret" | "site-origin" | "request-fingerprint";

function loopbackHostname(hostname: string): boolean {
  // URL parsing normalizes IP literals before this check; no DNS/proxy trust.
  return hostname === "localhost" || hostname === "[::1]" || /^127(?:\.\d{1,3}){3}$/.test(hostname);
}

function normalizedOrigin(value: string | undefined, allowLocalHttp: boolean): string | null {
  const input = value?.trim();
  if (!input || !/^https?:\/\/[^/?#\\\s@]+\/?$/i.test(input)) return null;
  try {
    const url = new URL(input);
    if (url.username || url.password || (url.protocol !== "https:" &&
      !(allowLocalHttp && url.protocol === "http:" && loopbackHostname(url.hostname)))) return null;
    return url.origin;
  } catch { return null; }
}

export function isLocalHttpOrigin(value: string): boolean {
  return normalizedOrigin(value, true)?.startsWith("http://") ?? false;
}

function configuredSiteOrigin(environment: ConfigEnvironment): string | null {
  if (environment.NEXT_PUBLIC_SITE_URL?.trim()) {
    return normalizedOrigin(environment.NEXT_PUBLIC_SITE_URL, !environment.VERCEL);
  }
  if (environment.VERCEL) {
    // Only the provider's project-level hostname, never a request Host or an
    // arbitrary preview hostname. Invalid explicit origins never fall back.
    const host = environment.VERCEL_PROJECT_PRODUCTION_URL;
    return host && /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(host)
      ? normalizedOrigin(`https://${host}`, false) : null;
  }
  return "http://localhost:3000";
}

function legacyKeyRole(key: string): string | undefined {
  const parts = key.split(".");
  if (parts.length !== 3) return undefined;
  try {
    const payload: unknown = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload && typeof payload === "object" && "role" in payload && typeof payload.role === "string"
      ? payload.role : undefined;
  } catch { return undefined; }
}

function configuredKey(value: string | undefined, kind: "public" | "server"): boolean {
  const key = value?.trim();
  if (!key) return false;
  if (/^sb_secret/i.test(key)) return kind === "server";
  if (/^sb_publishable/i.test(key)) return kind === "public";
  // Detect known key-role mix-ups, not authenticity. Nonempty opaque keys (and
  // unit examples) remain supported; this is not JWT signature verification.
  const role = legacyKeyRole(key);
  return role === undefined || role === (kind === "public" ? "anon" : "service_role");
}

/** Pure config checks only: no SDK, I/O or secret values in the result. Supply
 * private fields only from server code; readiness does not certify services. */
export function configReadiness(environment: ConfigEnvironment): {
  publicConfigured: boolean; adminReady: boolean; issues: ConfigIssue[];
} {
  const issues: ConfigIssue[] = [];
  if (!normalizedOrigin(environment.NEXT_PUBLIC_SUPABASE_URL, true)) issues.push("supabase-url");
  if (!configuredKey(environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, "public")) issues.push("publishable-key");
  const publicConfigured = issues.length === 0;
  if (!configuredKey(environment.SUPABASE_SERVICE_ROLE_KEY, "server")) issues.push("server-key");
  if (!environment.RATE_LIMIT_SECRET || environment.RATE_LIMIT_SECRET.length < 32) issues.push("rate-limit-secret");
  const origin = configuredSiteOrigin(environment);
  if (!origin) issues.push("site-origin");
  else if (!environment.VERCEL && !isLocalHttpOrigin(origin)) issues.push("request-fingerprint");
  return { publicConfigured, adminReady: issues.length === 0, issues };
}

export function isConfigured(): boolean {
  // Public preparation/discovery must not depend on private server credentials.
  return normalizedOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL, true) !== null &&
    configuredKey(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, "public");
}
export function siteUrl(): string {
  const origin = configuredSiteOrigin({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    VERCEL: process.env.VERCEL,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  });
  if (!origin) throw new Error("Configure a valid HTTPS site origin; HTTP is allowed only for local loopback outside Vercel.");
  return origin;
}
export function indexingEnabled(): boolean {
  return isConfigured() && process.env.SHAGUN_TEST_FIXTURES !== "true" &&
    /^https:\/\//.test(siteUrl()) && (!process.env.VERCEL_ENV || process.env.VERCEL_ENV === "production");
}
export function fixtureMode(): boolean {
  if (process.env.SHAGUN_TEST_FIXTURES !== "true") return false;
  const origin = configuredSiteOrigin({ NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL, VERCEL: process.env.VERCEL });
  // Invalid/partial API configuration is not permission to load synthetic data.
  if (process.env.VERCEL || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    !origin || !isLocalHttpOrigin(origin)) {
    throw new Error("Test fixtures are only allowed locally, without a connected database.");
  }
  return true;
}