import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { configReadiness, type ConfigIssue } from "@/lib/config";
import { LoginForm } from "@/components/admin/login-form";
import { Notice } from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in" };

const setupRequirements: Record<ConfigIssue, string> = {
  "supabase-url": "Set the public Supabase API URL to HTTPS, or loopback HTTP for a local Supabase instance.",
  "publishable-key": "Set the public Supabase publishable or anonymous key. Never use a privileged server key in public configuration.",
  "server-key": "Set the server-only Supabase service key; a public key cannot provide server access.",
  "rate-limit-secret": "Set a private, randomly generated RATE_LIMIT_SECRET with at least 32 characters.",
  "site-origin": "Set a site origin without credentials, a path, query or fragment. Vercel requires HTTPS; HTTP is for local loopback only.",
  "request-fingerprint": "Administration requires Vercel's trusted request-IP support or local loopback HTTP. Other hosts need a reviewed server configuration.",
};

export default function AdminLoginPage() {
  const { adminReady: configured, issues } = configReadiness({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    RATE_LIMIT_SECRET: process.env.RATE_LIMIT_SECRET,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    VERCEL: process.env.VERCEL,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  });
  return (
    <main id="main-content" tabIndex={-1} className="admin-login">
      <div className="admin-login-brand"><Link href="/" className="admin-brand"><ShieldCheck size={24} aria-hidden="true" /><span>Shagun <span className="admin-brand-label">Operations</span></span></Link></div>
      <section className="admin-login-panel" aria-labelledby="admin-login-title">
        <p className="a-eyebrow">Private administration</p>
        <h1 className="a-heading" id="admin-login-title">{configured ? "Sign in to Shagun" : "Connect Supabase to continue"}</h1>
        <p>Manage city inventory, research, photos and publishing. This is separate from the public website.</p>
        {configured ? <LoginForm /> : (
          <>
            <Notice title="Administration is not configured" tone="warning">Sign-in is unavailable until secure server setup is complete. No credentials are requested in this state, and there is no demo administrator access.</Notice>
            <ol className="admin-login-setup">
              {issues.map((issue) => <li key={issue}>{setupRequirements[issue]}</li>)}
              <li>Apply the project’s database migrations through a separate trusted operator step.</li>
              <li>Preserve the shared project’s Auth settings; Shagun access requires its own active administrator allowlist entry.</li>
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