"use server";

import "server-only";
import { invalidateInventory } from "@/lib/cache";
import { MEDIA_BUCKET } from "@/lib/db/schema";
import { enforceRateLimit } from "@/lib/security";
import type { ActionState } from "@/lib/types";
import { uuidSchema } from "@/lib/validation";
import { actionError, freshAdminContext } from "@/lib/actions/shared";

const BATCH_SIZE = 25;
const STORAGE_ROOT = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export async function cleanupStorageAction(_previous: ActionState, _formData: FormData): Promise<ActionState> {
  void _previous;
  void _formData;
  let completed = 0;
  let failed = 0;
  try {
    const { client, admin } = await freshAdminContext();
    await enforceRateLimit("admin-storage-cleanup", admin.id, 5, 60);
    const { data: jobs, error } = await client.from("storage_cleanup_jobs")
      .select("id,storage_key").lte("ready_at", new Date().toISOString())
      .order("ready_at").order("id").limit(BATCH_SIZE);
    if (error) throw error;
    if (!jobs) throw new Error("cleanup_unavailable");

    for (const job of jobs.slice(0, BATCH_SIZE)) {
      try {
        if (!uuidSchema.safeParse(job.id).success || !STORAGE_ROOT.test(job.storage_key)) {
          failed++;
          continue;
        }
        // Fail closed on a live reference or a failed lookup. Keep unexpected
        // jobs for investigation rather than deleting an asset still in use.
        const { data: reference, error: referenceError } = await client.from("media_assets")
          .select("id").eq("storage_key", job.storage_key).maybeSingle();
        if (referenceError || reference) {
          failed++;
          continue;
        }
        // RLS on the current session applies to both Storage and the outbox.
        // Missing variants are fine on retry; any provider error retains the job.
        const { error: storageError } = await client.storage.from(MEDIA_BUCKET).remove(
          [480, 960, 1600].map((width) => `${job.storage_key}/${width}.webp`),
        );
        if (storageError) {
          failed++;
          continue;
        }
        const { data: acknowledged, error: acknowledgeError } = await client.from("storage_cleanup_jobs")
          .delete().eq("id", job.id).eq("storage_key", job.storage_key).select("id").maybeSingle();
        if (acknowledgeError || !acknowledged) failed++;
        else completed++;
      } catch {
        // Continue the bounded batch, without logging keys or provider details.
        failed++;
      }
    }
  } catch (error) {
    return actionError(error);
  }

  if (completed > 0) invalidateInventory();
  if (failed > 0) {
    return { error: `${completed} cleanup job${completed === 1 ? "" : "s"} completed; ${failed} could not be confirmed and remain queued for retry. Please try again later.` };
  }
  return { success: true, message: completed === 0
    ? "No cleanup jobs are ready. Incomplete uploads become eligible after 15 minutes."
    : `Stored files removed for ${completed} cleanup job${completed === 1 ? "" : "s"}. Run cleanup again if more jobs remain.` };
}