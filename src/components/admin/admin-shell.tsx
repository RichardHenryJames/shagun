import Link from "next/link";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { logoutAction } from "@/lib/actions/auth";
import { AdminNavigation } from "@/components/admin/admin-navigation";
import { SignOutButton } from "@/components/admin/sign-out-button";

export function AdminShell({ display_name, children }: { display_name: string; children: ReactNode }) {
  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="admin-topbar">
          <Link href="/admin" prefetch={false} className="admin-brand" aria-label="Shagun administration overview"><ShieldCheck size={23} aria-hidden="true" /><span>Shagun <span className="admin-brand-label">Operations</span></span></Link>
          <div className="admin-account">
            <span className="admin-display-name"><span className="a-sr-only">Signed in as </span>{display_name}</span>
            <Link href="/" className="a-button a-button--quiet" prefetch={false}>Public website<ArrowUpRight size={15} aria-hidden="true" /></Link>
            <form action={logoutAction}><SignOutButton /></form>
          </div>
        </div>
        <div className="admin-nav-container"><AdminNavigation /></div>
      </header>
      <main id="main-content" tabIndex={-1} className="admin-main">{children}</main>
      <footer className="admin-footer">Private inventory operations · Changes are saved only when submitted.</footer>
    </div>
  );
}