"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useRef, useState } from "react";
import { CheckCheck, X } from "lucide-react";
import { bulkPublishVenuesAction } from "@/lib/actions/venues";
import { BULK_PUBLISH_LIMIT, type BulkPublishResult, type BulkPublishTarget } from "@/lib/bulk-publish";
import { formatCapacity, formatDate, formatPrice } from "@/lib/format";
import { FACILITY_LABELS, VENUE_TYPE_LABELS, type PublicVenue } from "@/lib/types";
import { StatusBadge } from "@/components/admin/status-badge";
import { VenueTable } from "@/components/admin/venue-table";
import { useNativeDialog } from "@/components/public/use-native-dialog";

const OUTCOMES = {
  ready: "Ready", blocked: "Needs attention", published: "Published", skipped: "Unchanged", conflict: "Changed since selection",
  unconfirmed: "Save unconfirmed", not_attempted: "Not attempted",
};

export function BulkPublishVenues({ venues, showCity = true }: { venues: PublicVenue[]; showCity?: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<BulkPublishTarget[]>([]);
  const [included, setIncluded] = useState<string[]>([]);
  const [reviewed, setReviewed] = useState(false);
  const [result, setResult] = useState<BulkPublishResult | null>(null);
  const [pending, setPending] = useState<"review" | "publish" | null>(null);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const mounted = useRef(false);
  const feedback = useRef<HTMLDivElement>(null);
  const { dialogRef, openDialog, closeDialog, restoreFocus, dismissBackdrop } = useNativeDialog();
  const eligible = venues.filter((venue) => venue.status === "draft" || venue.status === "unpublished").slice(0, BULK_PUBLISH_LIMIT);
  const chosen = selected.filter((target) => eligible.some((venue) => venue.id === target.id && venue.updated_at === target.expected_updated_at));
  const ready = result?.phase === "review" && !result.error ? result.rows.filter((row) => row.outcome === "ready" && included.includes(row.id)) : [];
  const published = result?.rows.filter((row) => row.outcome === "published").length ?? 0;
  const finished = result?.phase === "complete";

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (!pending && (result || error)) feedback.current?.focus(); }, [pending, result, error]);

  async function review(opener: HTMLButtonElement) {
    if (busy.current || !chosen.length) return;
    busy.current = true;
    setPending("review"); setResult(null); setReviewed(false); setIncluded([]); setError("");
    openDialog(opener);
    try {
      const response = await bulkPublishVenuesAction({ mode: "review", targets: chosen });
      if (!mounted.current) return;
      setResult(response);
      setIncluded(response.rows.filter((row) => row.outcome === "ready").map((row) => row.id));
    } catch {
      if (mounted.current) setError("The selected venues could not be loaded. Check your administrator session and try again.");
    } finally {
      busy.current = false;
      if (mounted.current) setPending(null);
    }
  }

  async function publish() {
    if (busy.current || !reviewed || !ready.length) return;
    busy.current = true;
    setPending("publish"); setError("");
    try {
      const response = await bulkPublishVenuesAction({ mode: "publish", reviewed: true,
        targets: ready.map(({ id, expected_updated_at }) => ({ id, expected_updated_at })),
      });
      if (!mounted.current) return;
      setResult(response); setIncluded([]); setSelected([]); setReviewed(false);
    } catch {
      if (!mounted.current) return;
      setError("The publish response could not be confirmed. Check saved inventory before reviewing again; some venues may already be published.");
      setResult(null); setIncluded([]); setSelected([]); setReviewed(false);
    } finally {
      busy.current = false;
      if (mounted.current) {
        setPending(null);
        startTransition(() => router.refresh());
      }
    }
  }

  return (
    <>
      <div className="a-bulk-toolbar" role="group" aria-label="Bulk venue publishing">
        <span role="status">{chosen.length} selected on this page</span>
        <div className="a-actions">
          <button type="button" className="a-button" disabled={!chosen.length || Boolean(pending)} onClick={(event) => void review(event.currentTarget)}>
            <CheckCheck size={17} aria-hidden="true" />Review &amp; publish{chosen.length ? ` (${chosen.length})` : ""}
          </button>
          {chosen.length > 0 && <button type="button" className="a-button a-button--quiet" disabled={Boolean(pending)} onClick={() => setSelected([])}>Clear selection</button>}
        </div>
      </div>
      {finished && <p role="status" className="a-field-hint">{published} published; {result.rows.length - published} unchanged or unconfirmed.</p>}
      {venues.length > 0 && <VenueTable venues={venues} showCity={showCity}
        selectionHeader={<label className="a-checkbox"><input type="checkbox" aria-label="Select all publishable statuses on this page"
          checked={eligible.length > 0 && chosen.length === eligible.length} disabled={!eligible.length || Boolean(pending)}
          ref={(node) => { if (node) node.indeterminate = chosen.length > 0 && chosen.length < eligible.length; }}
          onChange={(event) => setSelected(event.target.checked ? eligible.map((venue) => ({ id: venue.id, expected_updated_at: venue.updated_at })) : [])} />
          <span className="a-sr-only">Select this page</span></label>}
        selection={(venue) => <label className="a-checkbox"><input type="checkbox" aria-label={`Select ${venue.name} for publication`}
          disabled={!eligible.some((entry) => entry.id === venue.id) || Boolean(pending)} checked={chosen.some((entry) => entry.id === venue.id)}
          onChange={(event) => setSelected(event.target.checked ? [...chosen, { id: venue.id, expected_updated_at: venue.updated_at }]
            : chosen.filter((entry) => entry.id !== venue.id))} /><span className="a-sr-only">Select {venue.name}</span></label>} />}
      <dialog ref={dialogRef} className="a-bulk-dialog" aria-labelledby="bulk-publish-title"
        onClose={restoreFocus} onCancel={(event) => { if (busy.current) event.preventDefault(); }}
        onClick={(event) => { if (!busy.current) dismissBackdrop(event); }}>
        <header className="a-bulk-dialog-header">
          <h2 id="bulk-publish-title" className="a-section-title" tabIndex={-1} data-dialog-focus>{finished ? "Publication results" : "Review selected venues"}</h2>
          <button type="button" className="a-button a-icon-button" aria-label="Close bulk publishing" title="Close bulk publishing" disabled={Boolean(pending)} onClick={closeDialog}><X size={20} aria-hidden="true" /></button>
        </header>
        <div className="a-bulk-dialog-body" aria-busy={Boolean(pending)}>
          <div ref={feedback} tabIndex={-1} aria-live="polite" aria-atomic="true">
            {pending && <p role="status">{pending === "review" ? "Loading selected saved versions..." : `Publishing ${ready.length} venues...`}</p>}
            {(error || result?.error) && <p role="alert" className="a-feedback">{error || result?.error}</p>}
            {!pending && result && <p>{finished ? `${published} published; ${result.rows.length - published} unchanged or unconfirmed.`
              : `${result.rows.filter((row) => row.outcome === "ready").length} ready; ${result.rows.filter((row) => row.outcome !== "ready").length} need attention.`}</p>}
          </div>
          {result?.rows.map((row) => <article key={row.id} className="a-bulk-review-row" aria-label={row.name}>
            <div className="a-bulk-row-heading">
              {row.outcome === "ready" && result.phase === "review" ? <label className="a-checkbox"><input type="checkbox"
                checked={included.includes(row.id)} disabled={Boolean(pending)} aria-label={`Include ${row.name} in publication`}
                onChange={(event) => { setReviewed(false); setIncluded((current) => event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id)); }} />
                <strong>{row.name}</strong></label> : <h3>{row.name}</h3>}
              <span className="a-badge a-badge--neutral">{OUTCOMES[row.outcome]}</span>
            </div>
            {row.cityName && <p>{row.cityName}{!row.cityActive ? "; city not active, venue will remain private" : ""}</p>}
            {row.message && <p>{row.message}</p>}
            {row.details && result.phase === "review" && <>
              <dl className="a-bulk-facts">
                <div><dt>Type / locality</dt><dd>{VENUE_TYPE_LABELS[row.details.venue_type]}{row.details.locality ? ` / ${row.details.locality}` : ""}</dd></div>
                <div><dt>Address</dt><dd>{row.details.address}</dd></div>
                <div><dt>Phone / alternate</dt><dd>{row.details.phone ?? "Not recorded"}{row.details.alternate_phone ? ` / ${row.details.alternate_phone}` : ""}</dd></div>
                <div><dt>WhatsApp / email</dt><dd>{row.details.whatsapp ?? "Not recorded"}{row.details.email ? ` / ${row.details.email}` : ""}</dd></div>
                <div><dt>Capacity</dt><dd>{formatCapacity(row.details.capacity_min, row.details.capacity_max) ?? "Not recorded"}</dd></div>
                <div><dt>Price</dt><dd>{formatPrice(row.details.price_min, row.details.price_max, row.details.price_type) ?? "Not recorded"}</dd></div>
                <div><dt>Facilities</dt><dd>{row.details.facilities.map((facility) => FACILITY_LABELS[facility]).join(", ") || "Not recorded"}</dd></div>
                <div><dt>Verification</dt><dd><StatusBadge status={row.details.verification_status} />{row.details.verified_at ? ` ${formatDate(row.details.verified_at)}` : "; no check date"}</dd></div>
                <div className="a-span-full"><dt>Description</dt><dd>{row.details.description ?? "Not recorded"}</dd></div>
                <div className="a-span-full"><dt>Private source notes</dt><dd className="a-bulk-source">{row.details.source_notes}</dd></div>
              </dl>
              <details><summary>URL, coordinates and search appearance</summary><dl className="a-bulk-facts">
                <div><dt>Slug</dt><dd>{row.details.slug}</dd></div>
                <div><dt>Coordinates</dt><dd>{row.details.latitude !== null ? `${row.details.latitude}, ${row.details.longitude}` : "Not recorded"}</dd></div>
                <div><dt>SEO title</dt><dd>{row.details.seo_title ?? "Automatic"}</dd></div>
                <div><dt>SEO description</dt><dd>{row.details.seo_description ?? "Automatic"}</dd></div>
              </dl></details>
            </>}
            <Link className="a-table-action" href={`/admin/venues/${row.id}`} prefetch={false} target="_blank" rel="noopener noreferrer">Open venue editor<span className="a-sr-only"> for {row.name} (opens in a new tab)</span></Link>
          </article>)}
        </div>
        <form className="a-bulk-dialog-footer" onSubmit={(event) => { event.preventDefault(); void publish(); }}>
          {!finished && result?.phase === "review" && !result.error && <label className="a-checkbox a-checkbox--review">
            <input type="checkbox" checked={reviewed} disabled={!ready.length || Boolean(pending)} onChange={(event) => setReviewed(event.target.checked)} />
            <span>I have reviewed the selected venues&apos; recorded facts and sources, and approve publication.</span>
          </label>}
          <div className="a-actions">
            <button type="button" className="a-button" disabled={Boolean(pending)} onClick={closeDialog}>{finished ? "Done" : "Cancel"}</button>
            {!finished && <button type="submit" className="a-button a-button--primary" disabled={!reviewed || !ready.length || Boolean(pending)}><CheckCheck size={17} aria-hidden="true" />{pending === "publish" ? "Publishing..." : `Publish ${ready.length} venue${ready.length === 1 ? "" : "s"}`}</button>}
          </div>
        </form>
      </dialog>
    </>
  );
}