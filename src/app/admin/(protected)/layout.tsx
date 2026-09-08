import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/auth";
import { AdminShell } from "@/components/admin/admin-shell";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function ProtectedAdminLayout({ children }: { children: ReactNode }) {
  // Data repositories, actions and media handlers also authorize every request.
  const { admin } = await requireAdmin();
  return <AdminShell display_name={admin.display_name}>{children}</AdminShell>;
}