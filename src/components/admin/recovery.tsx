"use client";

import Link from "next/link";
import { RotateCw } from "lucide-react";

export function AdminRecovery({ reset }: { reset: () => void }) {
  return (
    <section className="a-recovery" aria-labelledby="admin-recovery-title">
      <h1 className="a-heading" id="admin-recovery-title">Administration could not be loaded</h1>
      <p>The request did not complete. No successful save is implied by this screen. Try again, or sign in again if your session has expired. If a save was interrupted, check the saved record before repeating it.</p>
      <div className="a-actions"><button type="button" onClick={reset} className="a-button a-button--primary"><RotateCw size={16} aria-hidden="true" />Try again</button><Link href="/admin" prefetch={false} className="a-button">Overview</Link><Link href="/admin/login" prefetch={false} className="a-button a-button--quiet">Sign in</Link></div>
    </section>
  );
}