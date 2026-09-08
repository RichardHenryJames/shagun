import "server-only";
import { z } from "zod";
import { sessionClient } from "@/lib/db/clients";
import { HttpError } from "@/lib/security";
import type { ActionState } from "@/lib/types";
import { uuidSchema } from "@/lib/validation";

type SessionClient = Awaited<ReturnType<typeof sessionClient>>;
type InventoryOperation = "save_city" | "save_venue" | "delete_city" | "delete_venue";
const SESSION_ERROR = "Your administrator session is unavailable. Please sign in again.";
const REQUEST_ERROR = "The request could not be completed. Please try again.";

/** Also used after login, with the very client that received the new session. */
export async function activeAdminFor(client: SessionClient, userId: string) {
  const { data: admin, error } = await client.from("admin_users")
    .select("id,display_name,is_active,created_at").eq("id", userId).eq("is_active", true).maybeSingle();
  if (error || !admin || admin.id !== userId || admin.is_active !== true) {
    throw new HttpError(401, SESSION_ERROR);
  }
  return admin;
}

/** No React/request memoization: every action revalidates Auth and the allowlist. */
export async function freshAdminContext() {
  const client = await sessionClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new HttpError(401, SESSION_ERROR);
  const admin = await activeAdminFor(client, data.user.id);
  return { client, admin };
}

/** Only declared scalar fields; never coerce a File or silently pick duplicates. */
export function textFields(formData: FormData, names: readonly string[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const name of names) {
    const values = formData.getAll(name);
    if (values.length > 1 || (values.length === 1 && typeof values[0] !== "string")) {
      throw new z.ZodError([{ code: "custom", path: [name], message: "Submit a single text value for this field." }]);
    }
    fields[name] = typeof values[0] === "string" ? values[0] : "";
  }
  return fields;
}

// Validation only. Never convert optimistic versions through JavaScript Date:
// PostgreSQL uses up to six fractional digits, and the original offset matters.
export const sqlTimestampSchema = z.iso.datetime({ offset: true }).regex(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/,
  "Use an ISO timestamp with a time zone and at most six fractional digits.",
);
const versionSchema = z.string().refine((value) => sqlTimestampSchema.safeParse(value).success,
  "Reload the record to obtain its current version before trying again.");
const emptyToNull = (value: unknown) => value === "" || value == null ? null : value;

export const saveVersionSchema = z.object({
  id: z.preprocess(emptyToNull, uuidSchema.nullable()),
  expected_updated_at: z.preprocess(emptyToNull, versionSchema.nullable()),
}).superRefine((value, context) => {
  if (value.id && !value.expected_updated_at) {
    context.addIssue({ code: "custom", path: ["expected_updated_at"], message: "Reload the record before saving; its version is missing." });
  }
  if (!value.id && value.expected_updated_at) {
    context.addIssue({ code: "custom", path: ["id"], message: "Reload the record before saving; its identifier is missing." });
  }
});

export const deleteRecordSchema = z.object({
  id: uuidSchema,
  expected_updated_at: versionSchema,
  // Do not trim: the database compares this with the locked record's exact name.
  confirm_name: z.string().min(2, "Type the record name to confirm deletion.").max(180),
});

/** Only allowlisted messages/codes reach the UI; no SQL, details, hints or input. */
export function actionError(error: unknown, operation?: InventoryOperation): ActionState {
  if (error instanceof z.ZodError) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const field = issue.path[0];
      if (typeof field === "string") (fieldErrors[field] ??= []).push(issue.message);
    }
    return { error: "Check the highlighted fields and try again.", fieldErrors };
  }
  if (error instanceof HttpError) {
    if (error.status === 401 || error.status === 403) return { error: SESSION_ERROR };
    if (error.status === 429) return { error: "Too many attempts. Please wait a few minutes and try again." };
    if (error.status === 503) return { error: "The service is temporarily unavailable. Please try again later." };
    return { error: REQUEST_ERROR };
  }
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "";
  const message = error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : "";
  switch (`${code}:${message}`) {
    case "P0001:conflict":
      return { error: "This record has changed since you opened it. Reload it before saving or deleting so newer changes are not overwritten." };
    case "P0002:not_found":
      return { error: "This record is no longer available. Return to the list and reload." };
    case "23514:name_mismatch":
      return { error: "The confirmation name does not match.", fieldErrors: { confirm_name: ["Type the record name exactly as shown, including spaces and capital letters."] } };
    case "23514:city_slug_locked":
      return { error: "This city's URL is locked after first activation.", fieldErrors: { slug: ["Keep the original city slug. Reload the record to restore it."] } };
    case "23514:venue_url_locked":
      return { error: "This venue's URL and city are locked after first publication.", fieldErrors: {
        slug: ["Keep the original venue slug."], city_id: ["Keep the original city association. Reload the record to restore it."],
      } };
    case "23514:city_requires_published_venue":
      return { error: "Publish a reviewed venue before activating this city.", fieldErrors: { status: ["Save as draft or inactive until a published venue is available."] } };
    case "23514:deactivate_before_delete":
      return { error: "Set the city to Inactive or Archived and save before permanently deleting it." };
    case "23514:unpublish_before_delete":
      return { error: operation === "delete_city"
        ? "Set the city to Inactive or Archived and save before permanently deleting it."
        : "Set the venue to Unpublished or Archived and save before permanently deleting it." };
    case "23514:editorial_review_required":
      return { error: "Source notes and an explicit editorial review are required.", fieldErrors: {
        source_notes: ["Record the sources used to check these facts."], reviewed: ["Review the facts and confirm the editorial review checkbox."],
      } };
    case "23514:verification_requires_fresh_review":
      return { error: "Verification needs a fresh review with this save.", fieldErrors: {
        reviewed: ["Review the current facts and confirm the review checkbox."], verified_at: ["Use the actual date on which the information was checked."],
      } };
    case "23514:save_facilities_with_editorial_review":
      return { error: "Save facility changes together with an editorial review.", fieldErrors: { reviewed: ["Review the recorded facilities before saving."], facilities: ["Confirm only positively established facilities."] } };
    case "22023:invalid_facilities":
      return { error: "Check the selected facilities.", fieldErrors: { facilities: ["Select facilities from the available options only."] } };
    case "22023:invalid_review_or_facilities":
      return { error: "Check the review and facility fields.", fieldErrors: { reviewed: ["Use the editorial review checkbox."], facilities: ["Select facilities from the available options only."] } };
    case "22007:iso_date_required":
      return { error: "Choose a valid check date.", fieldErrors: { verified_at: ["Use the date picker to supply the actual check date."] } };
  }
  if (code === "42501" || code === "PGRST301" || code === "PGRST302" || code === "PGRST303") return { error: SESSION_ERROR };
  if (code === "23505" && (operation === "save_city" || operation === "save_venue")) {
    return { error: "That URL slug is already in use.", fieldErrors: { slug: ["Choose a different slug, or open the existing record."] } };
  }
  if (code === "23503") {
    if (operation === "delete_city") return { error: "This city still contains venues. Archive it instead, or resolve its venue records before deleting it." };
    if (operation === "save_venue") return { error: "The selected city is no longer available.", fieldErrors: { city_id: ["Reload the city workspace and choose an existing city."] } };
    return { error: "This record is still in use. Resolve its related records before deleting it." };
  }
  if (["23502", "23514", "22001", "22003", "22007", "22008", "22023", "22P02", "22P05"].includes(code)) {
    return { error: "Some details do not meet the data or publishing requirements. Check the form and try again." };
  }
  return { error: REQUEST_ERROR };
}