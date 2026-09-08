import "server-only";
import { revalidatePath, revalidateTag } from "next/cache";

/** Safe in both Server Actions and Route Handlers; never serve stale inventory. */
export function invalidateInventory(): void {
  revalidateTag("inventory", { expire: 0 });
  // Covers public listings/details and admin counts/editors, including old slugs
  // and deleted owners, without another lookup after a successful mutation.
  revalidatePath("/", "layout");
}