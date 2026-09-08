"use client";

import { AdminRecovery } from "@/components/admin/recovery";

export default function ErrorBoundary({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main id="main-content" className="admin-boundary" tabIndex={-1}><AdminRecovery reset={reset} /></main>;
}