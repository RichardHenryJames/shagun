import { createHash } from "node:crypto";
import { actionError, freshAdminContext } from "@/lib/actions/shared";
import { invalidateInventory } from "@/lib/cache";
import { isConfigured } from "@/lib/config";
import { assertSameOrigin, enforceRateLimit, HttpError, readBoundedFormData, routeError } from "@/lib/security";
import { uuidSchema } from "@/lib/validation";
import { VENUE_IMPORT_BATCH_ROWS, VENUE_IMPORT_MAX_BYTES, VENUE_IMPORT_MAX_ROWS, type VenueImportReport } from "@/lib/venue-import";
import { createVenueWorkbook, parseVenueWorkbook, VenueImportFileError } from "@/lib/venue-import-workbook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff" };
const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
type AdminClient = Awaited<ReturnType<typeof freshAdminContext>>["client"];

function importFailure(error: unknown) {
  const response = routeError(error instanceof VenueImportFileError ? new HttpError(400, error.message) : error);
  Object.entries(PRIVATE_HEADERS).forEach(([key, value]) => response.headers.set(key, value));
  return response;
}

async function savedCity(client: AdminClient, value: unknown) {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) throw new HttpError(400, "Select a saved city workspace.");
  const { data, error } = await client.from("cities").select("id,name,slug").eq("id", parsed.data)
    .abortSignal(AbortSignal.timeout(5000)).maybeSingle();
  if (error) throw new HttpError(503, "The saved city could not be checked. Try again later.");
  if (!data || data.id !== parsed.data) throw new HttpError(404, "The selected city is no longer available.");
  return data;
}

export async function GET(request: Request) {
  try {
    if (!isConfigured()) throw new HttpError(503, "Secure server setup is incomplete.");
    const { client, admin } = await freshAdminContext();
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some((key) => key !== "city_id") || params.getAll("city_id").length !== 1) throw new HttpError(400, "Select one saved city workspace.");
    const city = await savedCity(client, params.get("city_id"));
    await enforceRateLimit("admin-venue-template", admin.id, 30, 60);
    const bytes = await createVenueWorkbook();
    return new Response(Uint8Array.from(bytes), { headers: {
      ...PRIVATE_HEADERS, "Content-Type": XLSX_TYPE,
      "Content-Disposition": `attachment; filename="shagun-${city.slug}-venue-template.xlsx"`,
    } });
  } catch (error) { return importFailure(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (!isConfigured()) throw new HttpError(503, "Secure server setup is incomplete.");
    const { client, admin } = await freshAdminContext();
    await enforceRateLimit("admin-venue-workbook", admin.id, 40, 60);
    const form = await readBoundedFormData(request, VENUE_IMPORT_MAX_BYTES + 16 * 1024);
    const allowed = new Set(["file", "city_id", "mode", "digest", "offset"]);
    if ([...form.keys()].some((key) => !allowed.has(key) || form.getAll(key).length !== 1)) throw new HttpError(400, "Upload one workbook with one set of import details.");
    const mode = form.get("mode");
    if (mode !== "validate" && mode !== "import") throw new HttpError(400, "Choose validation or draft import.");
    const rawOffset = form.get("offset");
    if (rawOffset !== null && (mode !== "import" || typeof rawOffset !== "string" || !/^(?:0|[1-9]\d{0,3})$/.test(rawOffset))) {
      throw new HttpError(400, "Choose a valid import batch.");
    }
    const offset = Number(rawOffset ?? 0);
    if (offset >= VENUE_IMPORT_MAX_ROWS || offset % VENUE_IMPORT_BATCH_ROWS !== 0) throw new HttpError(400, "Choose a valid import batch.");
    const file = form.get("file");
    if (!(file instanceof File) || !/\.xlsx$/i.test(file.name) || (file.type && ![XLSX_TYPE, "application/octet-stream", "application/zip"].includes(file.type))) {
      throw new HttpError(415, "Choose an Excel .xlsx workbook.");
    }
    if (!file.size || file.size > VENUE_IMPORT_MAX_BYTES) throw new HttpError(413, "Choose a nonempty .xlsx file no larger than 2 MiB.");
    const city = await savedCity(client, form.get("city_id"));
    const bytes = new Uint8Array(await file.arrayBuffer());
    const digest = createHash("sha256").update(city.id).update(bytes).digest("hex");
    if (mode === "import" && form.get("digest") !== digest) throw new HttpError(409, "The file or selected city changed. Validate this workbook again before importing.");
    const parsed = await parseVenueWorkbook(bytes, city.id);
    const report: VenueImportReport = {
      phase: parsed.issueCount ? "invalid" : "validated", cityId: city.id, digest, totalRows: parsed.totalRows,
      offset, nextOffset: null,
      created: 0, skipped: 0, remaining: parsed.totalRows, rows: [], issues: parsed.issues, issueCount: parsed.issueCount,
    };
    if (parsed.issueCount) return Response.json(report, { status: 422, headers: PRIVATE_HEADERS });
    if (offset >= parsed.rows.length) throw new HttpError(400, "This batch is outside the validated workbook.");
    const entries = mode === "validate" ? parsed.rows : parsed.rows.slice(offset, offset + VENUE_IMPORT_BATCH_ROWS);
    const existingBySlug = new Map<string, string>();
    for (let start = 0; start < entries.length; start += 50) {
      const slugs = entries.slice(start, start + 50).map(({ input }) => input.slug);
      const { data: existing, error: lookupError } = await client.from("venues").select("id,slug")
        .eq("city_id", city.id).in("slug", slugs).abortSignal(AbortSignal.timeout(5000));
      if (lookupError || !existing || existing.some((venue) => !uuidSchema.safeParse(venue.id).success || !slugs.includes(venue.slug))) {
        throw new HttpError(503, "Existing venues could not be checked. No drafts were imported in this request.");
      }
      existing.forEach((venue) => existingBySlug.set(venue.slug, venue.id));
    }
    report.rows = entries.map(({ row, input }) => {
      const id = existingBySlug.get(input.slug);
      return { row, name: input.name, slug: input.slug, outcome: id ? "existing" : "ready", ...(id ? { id } : {}) };
    });
    report.skipped = existingBySlug.size;
    report.remaining = report.totalRows - offset - report.skipped;
    if (mode === "validate") return Response.json(report, { headers: PRIVATE_HEADERS });
    await enforceRateLimit("admin-venue-import", admin.id, 30, 60);
    const deadline = Date.now() + 35_000;
    let unconfirmedWrite = false;
    try {
      for (const [index, entry] of entries.entries()) {
        const outcome = report.rows[index];
        if (outcome.outcome === "existing") continue;
        if (Date.now() >= deadline) throw new HttpError(503, "The batch reached its time limit.");
        unconfirmedWrite = true;
        outcome.outcome = "unconfirmed";
        const { data, error } = await client.rpc("save_venue", { p_id: null, p_expected: null, p_data: entry.input })
          .abortSignal(AbortSignal.timeout(8000));
        if (error) {
          if (/^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(error.code)) { unconfirmedWrite = false; outcome.outcome = "not_attempted"; }
          if (error.code === "23505") { outcome.outcome = "existing"; report.skipped++; continue; }
          throw error;
        }
        if (!uuidSchema.safeParse(data).success) throw new HttpError(503, "A saved draft could not be confirmed.");
        outcome.outcome = "created";
        outcome.id = data!;
        report.created++;
        unconfirmedWrite = false;
      }
      const end = offset + entries.length;
      report.nextOffset = end < report.totalRows ? end : null;
      report.phase = report.nextOffset === null ? "imported" : "importing";
    } catch (error) {
      report.phase = "stopped";
      report.error = `${actionError(error, "save_venue").error ?? "The import stopped."} Check saved inventory before retrying. Existing venues are never overwritten.`;
      report.rows.forEach((row) => { if (row.outcome === "ready") row.outcome = "not_attempted"; });
    }
    report.remaining = report.totalRows - offset - report.created - report.skipped;
    if (report.created > 0 || unconfirmedWrite) {
      try { invalidateInventory(); }
      catch { report.phase = "stopped"; report.nextOffset = null; report.error = "Saved drafts could not be reflected in the workspace. Reload and check inventory before retrying."; }
    }
    return Response.json(report, { status: report.phase === "stopped" ? 503 : 200, headers: PRIVATE_HEADERS });
  } catch (error) { return importFailure(error); }
}