"use client";

import { ErrorContent } from "@/components/public/error-content";

export default function PublicError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorContent reset={reset} />;
}