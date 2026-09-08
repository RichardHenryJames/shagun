"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sessionClient } from "@/lib/db/clients";
import { enforceRateLimit, requestFingerprint } from "@/lib/security";
import type { ActionState } from "@/lib/types";
import { loginSchema } from "@/lib/validation";
import { actionError, activeAdminFor, freshAdminContext, textFields } from "@/lib/actions/shared";

export async function loginAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  let credentials: { email: string; password: string };
  try {
    // The IP budget also applies to malformed forms; email normalization happens
    // before the separate durable account budget. Neither value is stored raw.
    await enforceRateLimit("admin-login-ip", await requestFingerprint(), 20, 900);
    const fields = textFields(formData, ["email", "password"]);
    credentials = loginSchema.parse({ email: fields.email.trim().toLowerCase(), password: fields.password });
    await enforceRateLimit("admin-login-email", credentials.email, 5, 900);
  } catch (error) {
    return actionError(error);
  }

  let client: Awaited<ReturnType<typeof sessionClient>> | undefined;
  try {
    client = await sessionClient();
    const { data, error } = await client.auth.signInWithPassword(credentials);
    if (error || !data.user || !data.session) throw new Error("login_rejected");
    // Do not call the memoized getAdminContext: it may predate these cookies.
    await activeAdminFor(client, data.user.id);
  } catch {
    if (client) {
      try { await client.auth.signOut({ scope: "local" }); }
      catch { /* Fail closed even when the provider cannot revoke the session. */ }
    }
    // Identical response for bad credentials, missing/inactive membership and
    // provider failures. Never return credentials or provider error messages.
    return { error: "Unable to sign in. Check your credentials and administrator access, then try again." };
  }

  revalidatePath("/admin", "layout");
  redirect("/admin");
}

// The existing shell uses a native form; stateful callers receive safe feedback.
export async function logoutAction(formData: FormData): Promise<void>;
export async function logoutAction(previous: ActionState, formData: FormData): Promise<ActionState>;
export async function logoutAction(_previous: ActionState | FormData, formData?: FormData): Promise<ActionState | void> {
  let failure: ActionState | undefined;
  try {
    const { client } = await freshAdminContext();
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) throw error;
  } catch (error) {
    failure = actionError(error);
  }
  if (failure) {
    if (formData !== undefined) return failure;
    // A native form has no ActionState renderer; use the existing error boundary.
    throw new Error(failure.error ?? "Sign out could not be completed. Please try again.");
  }
  revalidatePath("/admin", "layout");
  redirect("/admin/login");
}