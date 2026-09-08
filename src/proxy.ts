import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isConfigured, siteUrl } from "@/lib/config";
import type { Database } from "@/lib/db/database.types";
import { ADMIN_COOKIE_NAME, DB_SCHEMA } from "@/lib/db/schema";

/** Refresh sessions only on private paths; page/action guards also check the allowlist. */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  if (!isConfigured()) return response;
  const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: /^https:\/\//.test(siteUrl()), path: "/" };
  const supabase = createServerClient<Database, "shagun">(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    db: { schema: DB_SCHEMA },
    // Do not spread the base name into individual chunk/PKCE cookie writes.
    cookieOptions: { name: ADMIN_COOKIE_NAME, ...cookieOptions },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (entries, cacheHeaders) => {
        entries.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        entries.forEach(({ name, value, options }) => response.cookies.set(name, value, { ...options, ...cookieOptions }));
        Object.entries(cacheHeaders ?? {}).forEach(([key, value]) => response.headers.set(key, value));
        response.headers.set("Cache-Control", "private, no-store");
        response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
      },
    },
  });
  try { await supabase.auth.getClaims(); }
  catch { /* Route-level authorization still fails closed if Auth is unavailable. */ }
  return response;
}
export const config = { matcher: ["/admin/:path*", "/api/admin/:path*"] };