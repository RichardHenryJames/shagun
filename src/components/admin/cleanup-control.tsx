"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";
import { cleanupStorageAction } from "@/lib/actions/maintenance";
import { formatNumber } from "@/lib/format";
import type { ActionState } from "@/lib/types";
import { FormFeedback } from "@/components/admin/form-fields";

export function CleanupControl({ count }: { count: number }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(cleanupStorageAction, {});
  const router = useRouter();
  useEffect(() => { if (state.success) router.refresh(); }, [state, router]);
  return (
    <section className="a-support-panel" aria-labelledby="storage-cleanup-title">
      <h2 className="a-section-title" id="storage-cleanup-title">Storage cleanup</h2>
      <p>{formatNumber(count)} pending cleanup {count === 1 ? "job" : "jobs"}. Deleted records are eligible immediately; incomplete uploads become eligible after 15 minutes. Retry the queue if an earlier removal failed.</p>
      <form action={action} aria-busy={pending}>
        <FormFeedback state={state} />
        <button type="submit" className="a-button" disabled={pending || count === 0}><RotateCw size={16} aria-hidden="true" />{pending ? "Running cleanup…" : count > 0 ? "Retry storage cleanup" : "No cleanup pending"}</button>
      </form>
    </section>
  );
}