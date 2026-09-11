import "server-only";
import ExcelJS from "exceljs";
import { Unzip, UnzipInflate, zipSync } from "fflate";
import { z } from "zod";
import { PRICE_TYPES, VENUE_TYPES } from "@/lib/types";
import {
  VENUE_IMPORT_COLUMNS, VENUE_IMPORT_HEADERS, VENUE_IMPORT_MAX_BYTES, VENUE_IMPORT_MAX_ISSUES,
  VENUE_IMPORT_MAX_ROWS, VENUE_IMPORT_SHEET, venueImportRow, type VenueImportInput, type VenueImportIssue,
} from "@/lib/venue-import";

const MAX_EXPANDED_BYTES = 8 * 1024 * 1024;
const MAX_ENTRIES = 128;
const MAX_SHEET_ROWS = 1001;
const allowedPart = /^(?:\[Content_Types\]\.xml|_rels\/\.rels|docProps\/(?:app|core|custom)\.xml|xl\/(?:workbook\.xml|styles\.xml|sharedStrings\.xml|_rels\/workbook\.xml\.rels|theme\/theme\d+\.xml|worksheets\/sheet\d+\.xml|worksheets\/_rels\/sheet\d+\.xml\.rels|tables\/table\d+\.xml))$/;

export class VenueImportFileError extends Error {}
export interface ParsedVenueImport {
  rows: { row: number; input: VenueImportInput }[];
  issues: VenueImportIssue[];
  issueCount: number;
  totalRows: number;
}

function boundedWorkbook(bytes: Uint8Array): ArrayBuffer {
  if (!bytes.length || bytes.length > VENUE_IMPORT_MAX_BYTES) throw new VenueImportFileError("Choose a nonempty .xlsx file no larger than 2 MiB.");
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 3 || bytes[3] !== 4) throw new VenueImportFileError("Choose an Excel .xlsx workbook, not CSV, .xls or a password-protected file.");
  const parts: Record<string, Uint8Array> = Object.create(null);
  const seen = new Set<string>();
  let expandedBytes = 0;
  let completed = 0;
  try {
    const archive = new Unzip((file) => {
      if (seen.has(file.name) || seen.size >= MAX_ENTRIES || file.name.includes("..") || file.name.includes("\\")) {
        throw new VenueImportFileError("The workbook archive is invalid or contains too many parts. Use the blank template.");
      }
      seen.add(file.name);
      const directory = /^(?:_rels|docProps|xl(?:\/(?:_rels|theme|worksheets(?:\/_rels)?|tables))?)\/$/.test(file.name);
      if ((!directory && !allowedPart.test(file.name)) || (file.originalSize ?? 0) > MAX_EXPANDED_BYTES) {
        throw new VenueImportFileError("Use a plain .xlsx workbook without images, macros, embedded files or external workbook links.");
      }
      const chunks: Uint8Array[] = [];
      file.ondata = (error, data, final) => {
        if (error) throw error;
        expandedBytes += data.byteLength;
        if (expandedBytes > MAX_EXPANDED_BYTES) throw new VenueImportFileError("The expanded workbook is too large. Use the blank template and at most 100 venues.");
        chunks.push(data);
        if (final) {
          completed++;
          if (!directory) {
            const content = Buffer.concat(chunks);
            const xml = new TextDecoder("utf-8", { fatal: true }).decode(content);
            if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) throw new VenueImportFileError("XML document types and entities are not accepted in workbooks.");
            parts[file.name] = content;
          }
        }
      };
      file.start();
    });
    archive.register(UnzipInflate);
    for (let offset = 0; offset < bytes.length; offset += 1024) {
      archive.push(bytes.subarray(offset, offset + 1024), offset + 1024 >= bytes.length);
    }
    if (completed !== seen.size || !parts["[Content_Types].xml"] || !parts["xl/workbook.xml"] || !parts["_rels/.rels"]) throw new Error("incomplete_workbook");
    return Uint8Array.from(zipSync(parts, { level: 0 })).buffer;
  } catch (error) {
    if (error instanceof VenueImportFileError) throw error;
    throw new VenueImportFileError("The workbook could not be read. Save a fresh .xlsx copy using the template.");
  }
}

function plainCell(cell: ExcelJS.Cell): string | number | boolean | null {
  const value = cell.value;
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if ("richText" in value) return value.richText.map((part) => part.text).join("");
  if ("hyperlink" in value && typeof value.text === "string") return value.text;
  throw new VenueImportFileError("Use plain values, not formulas, dates or Excel errors.");
}

export async function parseVenueWorkbook(bytes: Uint8Array, cityId: string): Promise<ParsedVenueImport> {
  const workbook = new ExcelJS.Workbook();
  const bounded = boundedWorkbook(bytes);
  try { await workbook.xlsx.load(bounded); }
  catch { throw new VenueImportFileError("The workbook could not be read. Save a fresh .xlsx copy using the template."); }
  const sheet = workbook.getWorksheet(VENUE_IMPORT_SHEET);
  if (!sheet || sheet.state !== "visible" || workbook.worksheets.length > 2
    || workbook.worksheets.some((worksheet) => ![VENUE_IMPORT_SHEET, "Fields"].includes(worksheet.name))) {
    throw new VenueImportFileError('Use one visible "Venues" sheet and, optionally, the template\'s "Fields" sheet.');
  }
  if (sheet.hasMerges || sheet.rowCount > MAX_SHEET_ROWS || sheet.columnCount > VENUE_IMPORT_HEADERS.length) {
    throw new VenueImportFileError("Remove merged cells, extra columns and distant rows. Use the current template.");
  }
  const issues: VenueImportIssue[] = [];
  const headers: string[] = [];
  const headerRow = sheet.getRow(1);
  for (let index = 1; index <= sheet.columnCount; index++) {
    const cell = headerRow.getCell(index);
    let value: ReturnType<typeof plainCell>;
    try { value = plainCell(cell); }
    catch { value = null; }
    const key = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (!VENUE_IMPORT_COLUMNS.some((column) => column.key === key) || headers.includes(key) || sheet.getColumn(index).hidden) {
      issues.push({ row: 1, column: cell.address, message: "Use a unique, visible column with a current template header." });
    }
    headers.push(key);
  }
  for (const column of VENUE_IMPORT_COLUMNS.filter((entry) => entry.required)) {
    if (!headers.includes(column.key)) issues.push({ row: 1, column: column.key, message: "This required header is missing." });
  }
  if (issues.length) return { rows: [], issues, issueCount: issues.length, totalRows: 0 };
  const rows: ParsedVenueImport["rows"] = [];
  const slugs = new Map<string, number>();
  let totalRows = 0;
  sheet.eachRow((row, number) => {
    if (number === 1) return;
    const fields: Record<string, unknown> = {};
    let hasValues = false;
    const before = issues.length;
    headers.forEach((header, index) => {
      try {
        const value = plainCell(row.getCell(index + 1));
        fields[header] = value;
        if (value != null && (typeof value !== "string" || value.trim() !== "")) hasValues = true;
      } catch {
        hasValues = true;
        issues.push({ row: number, column: header, message: "Use plain values, not formulas, dates or Excel errors." });
      }
    });
    if (!hasValues) return;
    totalRows++;
    if (row.hidden) issues.push({ row: number, column: "row", message: "Unhide this row before importing." });
    if (issues.length !== before) return;
    try {
      const input = venueImportRow(fields, cityId);
      const previous = slugs.get(input.slug);
      if (previous !== undefined) issues.push({ row: number, column: "slug", message: `This slug duplicates row ${previous}. Use a distinct slug for each venue.` });
      else slugs.set(input.slug, number);
      rows.push({ row: number, input });
    } catch (error) {
      if (!(error instanceof z.ZodError)) throw error;
      for (const issue of error.issues) issues.push({ row: number, column: String(issue.path[0] ?? "row"), message: issue.message });
    }
  });
  if (!totalRows) issues.push({ row: 2, column: "name", message: "Add at least one venue below the headers." });
  if (totalRows > VENUE_IMPORT_MAX_ROWS) throw new VenueImportFileError("Import at most 100 venues per workbook. Split larger inventories into separate files.");
  return { rows, totalRows, issues: issues.slice(0, VENUE_IMPORT_MAX_ISSUES), issueCount: issues.length };
}

export async function createVenueWorkbook(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Shagun";
  const sheet = workbook.addWorksheet(VENUE_IMPORT_SHEET, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = VENUE_IMPORT_COLUMNS.map((column) => ({ key: column.key, width: column.kind === "facility" ? 19 : 25 }));
  sheet.addRow(VENUE_IMPORT_HEADERS);
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: VENUE_IMPORT_HEADERS.length } };
  sheet.getRow(1).height = 30;
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF273F39" } };
    cell.alignment = { vertical: "middle" };
  });
  for (let row = 2; row <= VENUE_IMPORT_MAX_ROWS + 1; row++) {
    VENUE_IMPORT_COLUMNS.forEach((column, index) => {
      const cell = sheet.getRow(row).getCell(index + 1);
      cell.numFmt = column.kind === "number" ? "0.########" : "@";
      cell.alignment = { vertical: "top", wrapText: true };
      const choices = column.key === "venue_type" ? VENUE_TYPES : column.key === "price_type" ? PRICE_TYPES : column.kind === "facility" ? ["yes", "no"] : null;
      if (choices) cell.dataValidation = { type: "list", allowBlank: !column.required, formulae: [`"${choices.join(",")}"`],
        showErrorMessage: true, errorTitle: "Choose a listed value", error: column.help };
    });
  }
  const fields = workbook.addWorksheet("Fields", { views: [{ state: "frozen", ySplit: 1 }] });
  fields.columns = [{ width: 26 }, { width: 23 }, { width: 100 }];
  fields.addRow(["Header", "Required for draft", "Format / meaning"]);
  for (const column of VENUE_IMPORT_COLUMNS) fields.addRow([column.key, column.required ? "yes" : "no", column.help]);
  fields.addRow(["City", "Selected in admin", "Create and save the city first, then import from its workspace. No city field is read from Excel."]);
  fields.addRow(["Publication", "Separate UI review", "Every import creates unreviewed, unverified drafts. Existing venues are skipped, never overwritten. Review and publish in the venue editor."]);
  fields.addRow(["Photographs", "Separate image upload", "After saving, upload genuine images with permission, alternative text and a rights credit in each venue editor. Images and remote photo URLs are not imported."]);
  fields.addRow(["File limits", "100 venues / 2 MiB", "Only the Venues sheet supplies rows. Use values, not formulas, merged/hidden cells, macros or embedded files. Leave unknown facts blank."]);
  fields.getRow(1).font = { bold: true };
  fields.eachRow((row) => { row.alignment = { wrapText: true, vertical: "top" }; row.height = 48; });
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}