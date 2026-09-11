import { z } from "zod";
import { slugify } from "@/lib/format";
import { FACILITY_CODES, FACILITY_LABELS } from "@/lib/types";
import { venueSchema } from "@/lib/validation";

export const VENUE_IMPORT_MAX_ROWS = 100;
export const VENUE_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const VENUE_IMPORT_MAX_ISSUES = 100;
export const VENUE_IMPORT_SHEET = "Venues";

export const VENUE_IMPORT_COLUMNS = [
  { key: "name", kind: "text", required: true, help: "Actual venue name; 2-180 characters." },
  { key: "slug", kind: "text", required: false, help: "Optional stable URL slug; lowercase letters, numbers and single hyphens. Generated from name when blank. Use a distinct slug for different venues with the same name." },
  { key: "venue_type", kind: "text", required: true, help: "vivah_bhawan, banquet_hall, community_hall, wedding_lawn, hotel or resort." },
  { key: "description", kind: "text", required: false, help: "Public factual description; maximum 8000 characters. No private research here." },
  { key: "locality", kind: "text", required: false, help: "Recorded locality; maximum 150 characters." },
  { key: "address", kind: "text", required: false, help: "Recorded full address; maximum 600 characters. Required later for publication." },
  { key: "phone", kind: "text", required: false, help: "Text with + and country code. Do not enter as an Excel number." },
  { key: "alternate_phone", kind: "text", required: false, help: "Alternate business phone as text with + and country code." },
  { key: "whatsapp", kind: "text", required: false, help: "Confirmed WhatsApp number as text with + and country code." },
  { key: "email", kind: "text", required: false, help: "Recorded business email address; maximum 254 characters." },
  { key: "capacity_min", kind: "number", required: false, help: "Whole number from 1 to 100000; leave unknown capacity blank." },
  { key: "capacity_max", kind: "number", required: false, help: "Whole number from 1 to 100000, at least capacity_min." },
  { key: "price_min", kind: "number", required: false, help: "Positive INR amount up to 100000000, without currency symbols or commas; requires price_type." },
  { key: "price_max", kind: "number", required: false, help: "Positive INR amount up to 100000000, at least price_min; requires price_type." },
  { key: "price_type", kind: "text", required: false, help: "per_day, per_event or per_plate when a price is recorded." },
  { key: "latitude", kind: "number", required: false, help: "Decimal degrees from -90 to 90; supply longitude too, or leave both blank." },
  { key: "longitude", kind: "number", required: false, help: "Decimal degrees from -180 to 180; supply latitude too, or leave both blank." },
  { key: "seo_title", kind: "text", required: false, help: "Optional public page title; maximum 70 characters." },
  { key: "seo_description", kind: "text", required: false, help: "Optional public search description; maximum 180 characters." },
  { key: "source_notes", kind: "text", required: false, help: "Private sources, dates, uncertainties and permission references; maximum 8000 characters. Required later for editorial review and publication." },
  ...FACILITY_CODES.map((key) => ({ key, kind: "facility" as const, required: false,
    help: `${FACILITY_LABELS[key]}: yes only when positively established. Blank or no leaves it unrecorded, not a public claim of absence.` })),
] as const;

export const VENUE_IMPORT_HEADERS = VENUE_IMPORT_COLUMNS.map((column) => column.key);
export type VenueImportInput = z.output<typeof venueSchema>;
export interface VenueImportIssue { row: number; column: string; message: string }

export const venueImportReportSchema = z.object({
  phase: z.enum(["invalid", "validated", "imported", "stopped"]),
  cityId: z.uuid(), digest: z.string().regex(/^[a-f0-9]{64}$/),
  totalRows: z.number().int().min(0).max(VENUE_IMPORT_MAX_ROWS),
  created: z.number().int().min(0).max(VENUE_IMPORT_MAX_ROWS),
  skipped: z.number().int().min(0).max(VENUE_IMPORT_MAX_ROWS),
  remaining: z.number().int().min(0).max(VENUE_IMPORT_MAX_ROWS),
  rows: z.array(z.object({
    row: z.number().int().min(2).max(1001), name: z.string().max(180), slug: z.string().max(90),
    outcome: z.enum(["ready", "existing", "created", "unconfirmed", "not_attempted"]), id: z.uuid().optional(),
  })).max(VENUE_IMPORT_MAX_ROWS),
  issues: z.array(z.object({ row: z.number().int().min(1).max(1001), column: z.string().max(100), message: z.string().max(1000) })).max(VENUE_IMPORT_MAX_ISSUES),
  issueCount: z.number().int().min(0), error: z.string().max(1000).optional(),
});
export type VenueImportReport = z.infer<typeof venueImportReportSchema>;

export function venueImportRow(fields: Record<string, unknown>, cityId: string): VenueImportInput {
  const issues: z.core.$ZodIssue[] = [];
  const values: Record<string, string | number | null> = {};
  const facilities: (typeof FACILITY_CODES)[number][] = [];
  for (const key of Object.keys(fields)) {
    if (!VENUE_IMPORT_COLUMNS.some((column) => column.key === key)) {
      issues.push({ code: "custom", path: [key], message: "This column is not supported. Use the current template headers." });
    }
  }
  for (const column of VENUE_IMPORT_COLUMNS) {
    const raw = fields[column.key];
    const value = typeof raw === "string" ? raw.trim() : raw;
    const empty = value === "" || value == null;
    if (column.kind === "facility") {
      const flag = typeof value === "string" ? value.toLowerCase() : value;
      if (flag === "yes" || flag === true) facilities.push(column.key);
      else if (!empty && flag !== "no" && flag !== false) {
        issues.push({ code: "custom", path: [column.key], message: "Use yes, no or a blank cell." });
      }
    } else if (empty) {
      values[column.key] = column.required || column.key === "source_notes" ? "" : null;
    } else if (column.kind === "number") {
      if ((typeof value !== "number" && (typeof value !== "string" || !/^-?\d+(?:\.\d+)?$/.test(value))) || !Number.isFinite(Number(value))) {
        issues.push({ code: "custom", path: [column.key], message: "Use a finite decimal number without symbols, commas or formulas." });
      } else values[column.key] = Number(value);
    } else if (typeof value !== "string") {
      issues.push({ code: "custom", path: [column.key], message: "Use a text cell; phone numbers must retain + and the country code." });
    } else if (value.length > 8000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
      issues.push({ code: "custom", path: [column.key], message: "Remove control characters and keep text within 8000 characters." });
    } else values[column.key] = value;
  }
  if (issues.length) throw new z.ZodError(issues);
  return venueSchema.parse({
    ...values, city_id: cityId, slug: values.slug || slugify(String(values.name ?? "")), facilities,
    status: "draft", verification_status: "unverified", verified_at: null, reviewed: false,
  });
}