"use client";

import { ErrorContent } from "@/components/public/error-content";
import { SiteHeader } from "@/components/public/site-header";
import { SiteFooter } from "@/components/public/site-footer";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="sh-site sh-recovery-shell"><SiteHeader /><main id="main-content" tabIndex={-1}><ErrorContent reset={reset} /></main><SiteFooter /></div>;
}