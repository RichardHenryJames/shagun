"use client";

import { startTransition, useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, FileCheck2, Upload } from "lucide-react";
import { VENUE_IMPORT_MAX_BYTES, VENUE_IMPORT_MAX_ROWS, venueImportReportSchema, type VenueImportReport } from "@/lib/venue-import";

const OUTCOME_LABELS = {
  ready: "Ready for draft", existing: "Existing; skipped", created: "Draft created", unconfirmed: "Save unconfirmed", not_attempted: "Not saved",
} as const;

function summary(report: VenueImportReport): string {
  if (report.phase === "invalid") return `${report.issueCount} workbook error${report.issueCount === 1 ? "" : "s"}. No venues were saved.`;
  if (report.phase === "validated") return `${report.remaining} new draft${report.remaining === 1 ? "" : "s"} ready; ${report.skipped} existing venue${report.skipped === 1 ? "" : "s"} will be skipped. Nothing has been saved.`;
  return `${report.created} draft${report.created === 1 ? "" : "s"} confirmed; ${report.skipped} existing venue${report.skipped === 1 ? "" : "s"} skipped.${report.remaining ? ` ${report.remaining} row${report.remaining === 1 ? "" : "s"} not confirmed.` : ""}`;
}

export function VenueImport({ cityId, workspace }: { cityId: string; workspace: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<VenueImportReport | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<"validate" | "import" | null>(null);
  const request = useRef<AbortController | null>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const workbookRef = useCallback((node: HTMLInputElement | null) => {
    const selected = node?.files?.[0];
    if (selected) setFile(selected);
  }, []);

  useEffect(() => () => { request.current?.abort(); request.current = null; }, []);
  useEffect(() => { if (report || error) feedback.current?.focus(); }, [report, error]);

  async function submit(mode: "validate" | "import") {
    if (request.current) return;
    if (!file || !/\.xlsx$/i.test(file.name) || !file.size || file.size > VENUE_IMPORT_MAX_BYTES) {
      setError("Choose a nonempty Excel .xlsx workbook no larger than 2 MiB.");
      return;
    }
    if (mode === "import" && (report?.phase !== "validated" || !report.remaining)) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(mode);
    setError("");
    if (mode === "validate") setReport(null);
    let failure = "";
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("city_id", cityId);
      body.set("mode", mode);
      if (mode === "import" && report) body.set("digest", report.digest);
      const response = await fetch("/api/admin/venue-import", { method: "POST", body, credentials: "same-origin", cache: "no-store", redirect: "error",
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(75_000)]) });
      const data: unknown = await response.json().catch(() => null);
      if (request.current !== controller) return;
      const result = venueImportReportSchema.safeParse(data);
      if (!result.success || result.data.cityId !== cityId) {
        if (data && typeof data === "object" && "error" in data && typeof data.error === "string") failure = data.error.slice(0, 1000);
        throw new Error("unconfirmed_response");
      }
      setReport(result.data);
      if (mode === "import") startTransition(() => router.refresh());
    } catch {
      if (request.current !== controller) return;
      setReport(null);
      setError(mode === "import"
        ? `${failure || "The import response could not be confirmed."} Check saved city inventory before retrying; some drafts may have been saved. Validate the file again to skip existing venues.`
        : failure || "The workbook could not be validated. Check your connection and administrator session, then try again.");
    } finally {
      if (request.current === controller) { request.current = null; setPending(null); }
    }
  }

  function validate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit("validate");
  }

  return (
    <>
      <form onSubmit={validate} className="a-upload-form" aria-label="Excel venue import" aria-busy={Boolean(pending)}>
        <div className="a-field">
          <label htmlFor="venue-workbook">Excel workbook</label>
          <input className="a-input" id="venue-workbook" name="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            ref={workbookRef} required disabled={Boolean(pending)} aria-describedby="venue-workbook-limits" aria-invalid={Boolean(error)} onChange={(event) => {
              setFile(event.target.files?.[0] ?? null); setReport(null); setError("");
            }} />
          <p className="a-field-hint" id="venue-workbook-limits">.xlsx only; 2 MiB maximum; up to {VENUE_IMPORT_MAX_ROWS} venues. Required columns: name, venue_type.</p>
        </div>
        <div className="a-upload-actions">
          <button type="submit" className="a-button" disabled={!file || Boolean(pending)}><FileCheck2 size={17} aria-hidden="true" />{pending === "validate" ? "Validating workbook..." : "Validate workbook"}</button>
          <span className="a-badge a-badge--neutral">Draft only</span>
          <span className="a-badge a-badge--neutral">Unverified</span>
          <span className="a-badge a-badge--warning">Review pending</span>
        </div>
      </form>
      <div ref={feedback} tabIndex={-1} className="a-import-feedback" aria-live="polite" aria-atomic="true">
        {pending && <p role="status">{pending === "validate" ? "Checking workbook rows and existing venues..." : "Importing drafts. Waiting for confirmed results..."}</p>}
        {error && <div className="a-feedback" role="alert"><p>{error}</p><Link href={workspace} prefetch={false} className="a-link">View saved city inventory</Link></div>}
        {report && !pending && <div className={`a-feedback${report.phase === "invalid" || report.phase === "stopped" ? "" : " a-feedback--success"}`} role={report.phase === "invalid" || report.phase === "stopped" ? "alert" : "status"}>
          <p>{summary(report)}</p>{report.error && <p>{report.error}</p>}
        </div>}
      </div>
      {report?.issues.length ? (
        <section className="a-panel" aria-labelledby="import-errors-title">
          <div className="a-panel-header"><h2 className="a-section-title" id="import-errors-title">Workbook errors</h2><p>{report.issues.length} of {report.issueCount} errors</p></div>
          <div className="a-table-wrap a-import-results" role="region" aria-label="Workbook errors" tabIndex={0}>
            <table className="a-table a-import-table"><caption className="a-sr-only">Excel row numbers and fields requiring correction</caption>
              <thead><tr><th scope="col">Excel row</th><th scope="col">Column</th><th scope="col">Problem</th></tr></thead>
              <tbody>{report.issues.map((issue, index) => <tr key={`${issue.row}-${issue.column}-${index}`}><th scope="row">{issue.row}</th><td>{issue.column}</td><td>{issue.message}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      ) : null}
      {report?.rows.length ? (
        <section className="a-panel" aria-labelledby="import-results-title" aria-busy={Boolean(pending)}>
          <div className="a-panel-header"><h2 className="a-section-title" id="import-results-title">{report.phase === "validated" ? "Import preview" : "Import results"}</h2>
            <div className="a-actions">
              {report.phase === "validated" && report.remaining > 0 && <button type="button" className="a-button a-button--primary" disabled={Boolean(pending)} onClick={() => void submit("import")}>
                <Upload size={17} aria-hidden="true" />{pending === "import" ? "Importing drafts..." : `Import ${report.remaining} draft${report.remaining === 1 ? "" : "s"}`}
              </button>}
              <Link href={`${workspace}?status=draft`} prefetch={false} className="a-button"><Check size={17} aria-hidden="true" />View saved drafts</Link>
            </div>
          </div>
          <div className="a-table-wrap a-import-results" role="region" aria-label="Venue import rows" tabIndex={0}>
            <table className="a-table a-import-table"><caption className="a-sr-only">Venue rows, stable slugs and import outcomes</caption>
              <thead><tr><th scope="col">Excel row</th><th scope="col">Venue</th><th scope="col">Result</th></tr></thead>
              <tbody>{report.rows.map((entry) => <tr key={entry.row}>
                <td>{entry.row}</td><th scope="row">{entry.id ? <Link href={`/admin/venues/${entry.id}`} prefetch={false} className="a-table-name">{entry.name}</Link> : entry.name}<span className="a-table-secondary">{entry.slug}</span></th>
                <td>{OUTCOME_LABELS[entry.outcome]}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}