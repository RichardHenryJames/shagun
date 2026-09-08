import { stdin, stdout, stderr } from "node:process";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "../src/lib/db/database.types";
import { DB_SCHEMA } from "../src/lib/db/schema";

// The existing admin:create package script loads .env.local with --env-file.
// This out-of-band CLI deliberately does not import Next's server-only clients.
class ProvisioningError extends Error {
  constructor(message: string, public exitCode = 1) { super(message); }
}

async function readAdministrator() {
  let hidden = false;
  const output = new Writable({
    write(chunk, _encoding, callback) {
      if (!hidden) stdout.write(chunk);
      // Do not queue readline output across a change in the hidden flag.
      callback();
    },
  });
  const terminal = createInterface({ input: stdin, output, terminal: true, historySize: 0 });
  const cancellation = new AbortController();
  const cancel = () => cancellation.abort();
  terminal.on("SIGINT", cancel);
  terminal.on("close", cancel);

  async function question(prompt: string, secret = false): Promise<string> {
    if (!secret) return terminal.question(prompt, { signal: cancellation.signal });
    hidden = true;
    stdout.write(prompt);
    try {
      return await terminal.question("", { signal: cancellation.signal });
    } finally {
      hidden = false;
      stdout.write("\n");
    }
  }

  try {
    const email = (await question("Administrator email: ")).trim().toLowerCase();
    const displayName = (await question("Administrator display name: ")).trim();
    if (!z.email().max(254).safeParse(email).success) throw new ProvisioningError("Enter a valid email address, no longer than 254 characters.");
    if (!z.string().min(1).max(100).safeParse(displayName).success) throw new ProvisioningError("Enter a display name between 1 and 100 characters.");
    const password = await question("Unique password (12–128 characters; input hidden): ", true);
    if (!z.string().min(12).max(128).safeParse(password).success) throw new ProvisioningError("Use a unique password between 12 and 128 characters.");
    const confirmation = await question("Confirm password (input hidden): ", true);
    if (password !== confirmation) throw new ProvisioningError("Passwords did not match. No account was created; run the command again.");
    return { email, displayName, password };
  } catch (error) {
    if (cancellation.signal.aborted) throw new ProvisioningError("Provisioning cancelled. No account was created.", 130);
    throw error;
  } finally {
    terminal.close();
    output.end();
  }
}

async function main(): Promise<void> {
  if (process.argv.length > 2) {
    throw new ProvisioningError("Do not supply credentials as arguments. Run npm run admin:create without arguments in a trusted interactive terminal.");
  }
  if (!stdin.isTTY || !stdout.isTTY || typeof stdin.setRawMode !== "function") {
    throw new ProvisioningError("An interactive TTY is required for hidden password input. From the project root, run npm run admin:create in a trusted terminal without piping or redirecting input/output. Configure service credentials in .env.local, never in command arguments.");
  }
  const environment = z.object({
    url: z.url().refine((value) => ["https:", "http:"].includes(new URL(value).protocol)),
    key: z.string().min(1),
  }).safeParse({ url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY });
  if (!environment.success) {
    throw new ProvisioningError("Configure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local, then run npm run admin:create from the project root. Do not share these values.");
  }

  stdout.write("Out-of-band Shagun administrator provisioning.\nShared project Auth settings should not be changed without checking other apps; Shagun's active UUID allowlist controls access.\n");
  const client = createClient<Database, "shagun">(environment.data.url, environment.data.key, {
    db: { schema: DB_SCHEMA },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  try {
    // Confirm API schema access before prompting for a password or creating Auth
    // state. A HEAD request with limit zero never retrieves allowlist records.
    const { error } = await client.from("admin_users").select("id", { head: true }).limit(0);
    if (error) throw new Error("schema_access_failed");
  } catch {
    throw new ProvisioningError("Shagun schema access could not be verified. Check the shagun migrations, API schema exposure and service credentials before retrying. No password was requested and no account was created.");
  }
  const administrator = await readAdministrator();

  let createdUserId: string;
  try {
    const { data, error } = await client.auth.admin.createUser({
      email: administrator.email, password: administrator.password, email_confirm: true,
    });
    if (error || !data.user) throw new Error("auth_creation_failed");
    createdUserId = data.user.id;
  } catch {
    // Do not find, update, promote or delete an existing Auth user on a conflict.
    throw new ProvisioningError("The Auth account could not be created. Check connectivity, the managed password policy and whether the email is already registered. No allowlist change was attempted.");
  } finally {
    administrator.password = "";
  }

  try {
    const { error } = await client.from("admin_users").insert({
      id: createdUserId, display_name: administrator.displayName, is_active: true,
    });
    if (error) throw new Error("allowlist_insertion_failed");
  } catch {
    let rollbackFailed = false;
    try {
      // This ID is exclusively the successful createUser result from this run.
      const { error } = await client.auth.admin.deleteUser(createdUserId);
      rollbackFailed = Boolean(error);
    } catch {
      rollbackFailed = true;
    }
    throw new ProvisioningError(rollbackFailed
      ? "Allowlist insertion failed and automatic rollback could not be confirmed. The newly created Auth account may remain. Review that account in the managed dashboard before retrying; do not remove unrelated users."
      : "Allowlist insertion failed. The Auth account created by this run was removed. Check the inventory migration and service permissions before retrying.");
  }

  stdout.write("Administrator created and added to Shagun's active UUID allowlist. Credentials have not been printed or saved by this script.\n");
}

void main().catch((error: unknown) => {
  // Never print provider responses, error stacks, keys or submitted credentials.
  stderr.write(`${error instanceof ProvisioningError ? error.message : "Provisioning could not be completed. Check the local environment and managed service configuration."}\n`);
  process.exitCode = error instanceof ProvisioningError ? error.exitCode : 1;
});