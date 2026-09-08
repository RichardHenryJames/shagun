"use client";

import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { ArchMotif } from "@/components/public/artwork";

export function ErrorContent({ reset }: { reset: () => void }) {
  return (
    <section className="sh-container sh-recovery-content">
      <ArchMotif className="sh-recovery-art" />
      <p className="sh-eyebrow">A SMALL PAUSE</p>
      <h1 className="sh-display">The details couldn’t<br /><em>quite get here.</em></h1>
      <p>This page could not be loaded. Try again, or return to Shagun and start with a city guide.</p>
      <div className="sh-recovery-actions"><button type="button" className="sh-button sh-button-primary" onClick={reset}><RotateCcw size={17} aria-hidden="true" />Try again</button><Link href="/" className="sh-button sh-button-secondary">Back to Shagun</Link></div>
    </section>
  );
}