"use client";

import { useActionState } from "react";
import { importResearchAction, type ResearchSummary } from "@/lib/actions/research";
import type { ActionState } from "@/lib/types";
import { FormFeedback } from "@/components/admin/form-fields";
import { StatsRow } from "@/components/admin/ui";

// Only flat summary props cross this boundary, never catalog JSON or provenance.
export function ResearchImport({ cityId, ...summary }: ResearchSummary & { cityId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(importResearchAction, {});
  const headingId = `research-${summary.catalogKey}-title`;
  const guidanceId = `research-${summary.catalogKey}-guidance`;
  return (
    <section className="a-panel" aria-labelledby={headingId}>
      <h2 className="a-section-title" id={headingId}>{summary.cityName} research • {summary.venueCount} venues</h2>
      <p className="a-section-description">
        Researched on <time dateTime={summary.researchedOn}>{summary.researchedOn}</time>. Source pages checked {summary.sourceCheckedFrom === summary.sourceCheckedThrough
          ? <time dateTime={summary.sourceCheckedThrough}>{summary.sourceCheckedThrough}</time>
          : <><time dateTime={summary.sourceCheckedFrom}>{summary.sourceCheckedFrom}</time> to <time dateTime={summary.sourceCheckedThrough}>{summary.sourceCheckedThrough}</time></>}.
      </p>
      <p className="a-section-description">{summary.method}.</p>
      <StatsRow label={`${summary.cityName} research batch`} items={[
        { label: "Address + contact recorded", value: summary.fieldCompleteCount },
        { label: "Marked for editorial review", value: summary.readyForReviewCount },
        { label: "Needs source follow-up", value: summary.needsFollowUpCount },
        { label: "Source pages checked", value: summary.sourceCount },
      ]} />
      <p className="a-field-hint">Recorded fields do not establish accuracy or publication readiness. All {summary.venueCount} venues still need editorial review; follow-up notes remain private.</p>
      <form action={action} aria-busy={pending} aria-describedby={guidanceId}>
        <input type="hidden" name="city_id" value={cityId} />
        <input type="hidden" name="catalog_key" value={summary.catalogKey} />
        <FormFeedback state={state} />
        <p className="a-section-description" id={guidanceId}>
          Add private, unreviewed drafts only. Existing venues are skipped without changing edits. Nothing is verified or published, and the city status stays unchanged. No photos are imported; website and gallery references are kept in private research.
        </p>
        <div className="a-actions">
          <button type="submit" className="a-button a-button--primary" disabled={pending}>{pending ? "Adding researched drafts…" : "Add researched drafts"}</button>
        </div>
        <p className="a-field-hint">After adding, open each venue below to check its sources, use Saved preview, and explicitly review and publish through the existing editor.</p>
      </form>
    </section>
  );
}