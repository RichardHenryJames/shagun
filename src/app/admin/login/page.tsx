import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { isConfigured } from "@/lib/config";
import { LoginForm } from "@/components/admin/login-form";
import { Notice } from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in" };

export default function AdminLoginPage() {
  const configured = isConfigured();
  return (
    <main id="main-content" tabIndex={-1} className="admin-login">
      <div className="admin-login-brand"><Link href="/" className="admin-brand"><ShieldCheck size={24} aria-hidden="true" /><span>Shagun <span className="admin-brand-label">Operations</span></span></Link></div>
      <section className="admin-login-panel" aria-labelledby="admin-login-title">
        <p className="a-eyebrow">Private administration</p>
        <h1 className="a-heading" id="admin-login-title">{configured ? "Sign in to Shagun" : "Connect Supabase to continue"}</h1>
        <p>Manage city inventory, research, photos and publishing. This is separate from the public website.</p>
        {configured ? <LoginForm /> : (
          <>
            <Notice title="Administration is not configured" tone="warning">Sign-in is unavailable until Supabase is connected. Credentials are never accepted locally and there is no demo administrator access.</Notice>
            <ol className="admin-login-setup">
              <li>Configure this deployment’s Supabase environment and apply the project’s database migrations.</li>
              <li>Disable public signups in Supabase Auth.</li>
              <li>Provision an Auth account and its active administrator allowlist entry through secure administrative setup.</li>
              <li>Reload the deployment after configuration, then sign in with that provisioned account.</li>
            </ol>
          </>
        )}
        <p className="admin-login-note">There is no public registration. Accounts and access recovery are handled by the deployment administrator.</p>
        <Link href="/" className="a-button a-button--quiet">Back to public website</Link>
      </section>
    </main>
  );
}