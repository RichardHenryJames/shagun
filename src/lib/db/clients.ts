import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isConfigured, siteUrl } from "@/lib/config";
import type { Database } from "@/lib/db/database.types";
import { ADMIN_COOKIE_NAME, DB_SCHEMA } from "@/lib/db/schema";

function credentials() {
  if (!isConfigured()) throw new Error("Database is not configured.");
  return { url: process.env.NEXT_PUBLIC_SUPABASE_URL!, key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! };
}
const uncachedFetch: typeof fetch = (input, init) => fetch(input, { ...init, cache: "no-store" });

/** A session-free, anonymous client. Public reads must never use the service key. */
export function anonymousClient() {
  const { url, key } = credentials();
  return createClient<Database, "shagun">(url, key, {
    db: { schema: DB_SCHEMA },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: uncachedFetch },
  });
}

export const adminCookieOptions = () => ({
  httpOnly: true, sameSite: "lax" as const, secure: /^https:\/\//.test(siteUrl()), path: "/",
});

export async function sessionClient() {
  const { url, key } = credentials();
  const store = await cookies();
  return createServerClient<Database, "shagun">(url, key, {
    db: { schema: DB_SCHEMA },
    global: { fetch: uncachedFetch },
    // Set the SSR storage key only here; cookie writes must retain chunk/PKCE names.
    cookieOptions: { name: ADMIN_COOKIE_NAME, ...adminCookieOptions() },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (entries) => {
        try { entries.forEach(({ name, value, options }) => store.set(name, value, { ...options, ...adminCookieOptions() })); }
        catch { /* Server Components cannot write cookies; the admin proxy refreshes them. */ }
      },
    },
  });
}

/** Privileged, server-only: limiter/events and gated private-object delivery. */
export function serviceClient() {
  const { url } = credentials();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Server credentials are not configured.");
  return createClient<Database, "shagun">(url, key, {
    db: { schema: DB_SCHEMA },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: uncachedFetch },
  });
}