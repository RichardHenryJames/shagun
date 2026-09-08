"use client";

import { AdminRecovery } from "@/components/admin/recovery";

export default function ErrorBoundary({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <AdminRecovery reset={reset} />;
}