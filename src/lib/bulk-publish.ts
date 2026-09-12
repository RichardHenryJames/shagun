import type { z } from "zod";
import type { venueSchema } from "@/lib/validation";

export const BULK_PUBLISH_LIMIT = 25;

export type BulkPublishTarget = { id: string; expected_updated_at: string };
export type BulkPublishRow = BulkPublishTarget & {
  name: string;
  outcome: "ready" | "blocked" | "published" | "skipped" | "conflict" | "unconfirmed" | "not_attempted";
  message?: string;
  cityName?: string;
  cityActive?: boolean;
  details?: z.output<typeof venueSchema>;
};
export type BulkPublishResult = { phase: "review" | "complete"; rows: BulkPublishRow[]; error?: string };