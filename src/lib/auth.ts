import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { isConfigured } from "@/lib/config";
import { sessionClient } from "@/lib/db/clients";

/** Request memoization only, never cross-request caching of authorization. */
export const getAdminContext = cache(async () => {
  if (!isConfigured()) return null;
  const client = await sessionClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return null;
  const { data: admin, error: adminError } = await client.from("admin_users")
    .select("id,display_name,is_active,created_at").eq("id", user.id).eq("is_active", true).maybeSingle();
  if (adminError || !admin) return null;
  return { client, admin };
});

export async function requireAdmin() {
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  return context;
}