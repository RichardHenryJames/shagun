import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { readMigrationSources, STORAGE_POLICIES } from "./db-migration-plan";
import type { Database } from "../src/lib/db/database.types";

// This executable cannot select a hosted database or a caller-supplied origin.
// Local service keys/passwords stay in memory and child environments, not files/logs.
const ROOT = resolve(__dirname, "..");
const STACK = resolve(ROOT, "tests/local-stack");
const PROJECT = "shagun-integration";
const API = "http://127.0.0.1:55321";
const ORIGIN = "http://localhost:3200";
const mode = process.argv[2];
let stage = "arguments";

function cleanEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^(?:VERCEL(?:_|$)|SUPABASE_|NEXT_PUBLIC_SUPABASE_|SHAGUN_|DATABASE_URL$|DIRECT_URL$|POSTGRES_|RATE_LIMIT_SECRET$|DEBUG$|PWDEBUG$|PW_TEST_)/i.test(key)) delete env[key];
  }
  env.NEXT_TELEMETRY_DISABLED = "1";
  env.SUPABASE_TELEMETRY_DISABLED = "1";
  return env;
}

function cli(args: string[]) {
  // Both stdout/stderr are captured because Supabase start/status prints local keys.
  const result = spawnSync(process.execPath, [resolve(ROOT, "node_modules/supabase/dist/supabase.js"), ...args], {
    cwd: ROOT, env: cleanEnvironment(), encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    // Never print the CLI's original failure: it can contain database URLs or keys.
    const combined = `${result.stderr ?? ""}\n${result.stdout ?? ""}`;
    const safeLines = combined.split(/\r?\n/).filter((line) => /error|failed|invalid|unsupported|unknown|not found|unhealthy/i.test(line)
      && !/secret|password|token|eyJ|sb_|postgres(?:ql)?:\/\/|authorization|apikey|key\s*[:=]/i.test(line))
      .map((line) => line.replace(/\x1b\[[0-9;]*m/g, "").slice(0, 250)).slice(-5);
    throw new Error(`Local Supabase ${args[0]} failed. ${safeLines.join(" ") || "Original credential-bearing output is withheld."}`);
  }
  return result.stdout;
}

function status() {
  const output = cli(["status", "--workdir", STACK, "--output", "json"]);
  let value: Record<string, unknown>;
  try { value = JSON.parse(output); } catch { throw new Error("Local Supabase status was not valid JSON."); }
  const api = value.API_URL;
  const raw = value.DB_URL;
  if (api !== API || typeof raw !== "string" || typeof value.ANON_KEY !== "string" || typeof value.SERVICE_ROLE_KEY !== "string") throw new Error("Unexpected local Supabase identity or missing local keys.");
  const db = new URL(raw);
  if (!["localhost", "127.0.0.1"].includes(db.hostname) || db.port !== "55322" || db.pathname !== "/postgres") throw new Error("Refusing a non-isolated database.");
  return { api, database: raw, anon: value.ANON_KEY, service: value.SERVICE_ROLE_KEY };
}

function command(file: string, args: string[], env: NodeJS.ProcessEnv) {
  const result = spawnSync(process.execPath, [resolve(ROOT, file), ...args], { cwd: ROOT, env, stdio: "inherit" });
  if (result.error || result.status !== 0) throw new Error(`Integration ${args[0]} failed. Review the sanitized test/build output.`);
}

async function main() {
  if (!["start", "stop", "build", "test", "inspect"].includes(mode ?? "") || Object.keys(process.env).some((name) => /^VERCEL(?:_|$)/i.test(name))) {
    throw new Error("Use integration start, stop, build, test or inspect locally, never on Vercel.");
  }
  if (mode === "start") {
    console.log(`Starting isolated ${PROJECT} Auth, REST, Storage and PostgreSQL; first use downloads service images.`);
    cli(["start", "--workdir", STACK]);
    const current = status();
    console.log(`Local integration services ready at ${current.api}; keys were not printed.`);
    return;
  }
  if (mode === "stop") {
    cli(["stop", "--workdir", STACK, "--project-id", PROJECT]);
    console.log("Only the isolated Shagun integration services were stopped; data retained.");
    return;
  }
  const current = status();
  if (mode === "inspect") {
    console.log(JSON.stringify({ project: PROJECT, api: current.api, localOnly: true, keysAvailable: true }));
    return;
  }
  const env: NodeJS.ProcessEnv = {
    ...cleanEnvironment(), NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: ORIGIN,
    NEXT_PUBLIC_SUPABASE_URL: API, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: current.anon,
    SUPABASE_SERVICE_ROLE_KEY: current.service, RATE_LIMIT_SECRET: randomBytes(32).toString("hex"),
    SHAGUN_TEST_FIXTURES: "false", SHAGUN_INTEGRATION_TEST: "true",
    NEXT_PUBLIC_ANALYTICS_ENABLED: "false", NEXT_PUBLIC_CONTACT_EMAIL: "",
  };
  if (mode === "build") {
    command("node_modules/next/dist/bin/next", ["build"], env);
    return;
  }
  const sql = postgres(current.database, { max: 1, prepare: false, onnotice: () => undefined });
  const client = createClient<Database, "shagun">(API, current.service, {
    db: { schema: "shagun" }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const users: string[] = [];
  try {
    stage = "verify-test-container";
    // Verify the exact local container identity before destructive test reset.
    const inspection = spawnSync("docker", ["inspect", "--format", "{{.Name}}", `supabase_db_${PROJECT}`], { encoding: "utf8", env: cleanEnvironment() });
    if (inspection.status !== 0 || inspection.stdout.trim() !== `/supabase_db_${PROJECT}`) throw new Error("The dedicated integration database container was not verified.");
    stage = "test-ownership";
    await sql`create schema if not exists shagun_test_control`;
    await sql`create table if not exists shagun_test_control.owner (id text primary key)`;
    const owners = await sql<{ id: string }[]>`select id from shagun_test_control.owner`;
    if (owners.length && (owners.length !== 1 || owners[0].id !== PROJECT)) throw new Error("The local test database belongs to a different suite.");
    if (!owners.length) {
      const [existing] = await sql<{ exists: boolean }[]>`select
        to_regnamespace('shagun') is not null or to_regnamespace('shagun_private') is not null
        or exists(select 1 from storage.buckets where id = 'shagun-media')
        or exists(select 1 from pg_policy where polrelid = 'storage.objects'::regclass
          and polname::text = any(${sql.array([...STORAGE_POLICIES], 25)}::text[])) as exists`;
      if (existing.exists) throw new Error("Refusing to reset unowned local Shagun schemas, bucket or policies.");
      await sql`insert into shagun_test_control.owner (id) values (${PROJECT})`;
    }
    // Clear only this suite's local bucket via Storage APIs, never shared services.
    stage = "test-storage-cleanup";
    const { data: roots, error: listError } = await client.storage.from("shagun-media").list("", { limit: 1000 });
    if (!listError && roots?.length) {
      for (const root of roots) {
        if (!/^[0-9a-f-]{36}$/.test(root.name)) throw new Error("Unexpected object in test-owned bucket; automatic removal refused.");
        const { error } = await client.storage.from("shagun-media").remove([480, 960, 1600].map((w) => `${root.name}/${w}.webp`));
        if (error) throw new Error("Unable to clear test-owned local media.");
      }
    }
    const bucket = await client.storage.getBucket("shagun-media");
    if (bucket.data) {
      const deleted = await client.storage.deleteBucket("shagun-media");
      if (deleted.error) throw new Error("Unable to clear test-owned local media bucket.");
    } else if (bucket.error && ![400, 404].includes(Number("status" in bucket.error ? bucket.error.status : 0))) {
      throw new Error("Unable to clear test-owned local media bucket.");
    }
    await sql.begin(async (tx) => {
      stage = "reset-test-inventory-schema";
      // Two bucket-only guards do not depend on shagun functions, so CASCADE
      // cannot remove them. Drop only this suite's exact six reviewed policies.
      for (const policy of STORAGE_POLICIES) await tx`drop policy if exists ${tx(policy)} on storage.objects`;
      await tx`drop schema if exists shagun cascade`;
      stage = "reset-test-private-schema";
      await tx`drop schema if exists shagun_private cascade`;
      const migrations = await readMigrationSources(resolve(ROOT, "supabase/migrations"));
      for (const migration of migrations) {
        stage = `local-migration-${migration.version}`;
        for (const statement of migration.statements) await tx.unsafe(statement.text, [], { prepare: false }).simple();
      }
      stage = "local-draft-seed";
      await tx.unsafe(await readFile(resolve(ROOT, "supabase/seed.sql"), "utf8"), [], { prepare: false }).simple();
      await tx`notify pgrst, 'reload schema'`;
    });
    const identities: Record<string, string> = {};
    stage = "local-auth-provisioning";
    const registration = await createClient(API, current.anon, { auth: { persistSession: false, autoRefreshToken: false } })
      .auth.signUp({ email: `registration-denied-${randomBytes(8).toString("hex")}@example.test`, password: `${randomBytes(24).toString("base64url")}!a9` });
    if (!registration.error || registration.data.user) throw new Error("Isolated Auth public registration was not denied.");
    for (const width of [390, 768, 1440]) {
      for (const role of ["ADMIN", "NONADMIN"] as const) {
        const email = `shagun-${role.toLowerCase()}-${width}-${randomBytes(8).toString("hex")}@example.test`;
        const password = `${randomBytes(24).toString("base64url")}!a9`;
        const { data, error } = await client.auth.admin.createUser({ email, password, email_confirm: true });
        if (error || !data.user) throw new Error("Isolated Auth account provisioning failed; no credentials logged.");
        users.push(data.user.id);
        if (role === "ADMIN") await sql`insert into shagun.admin_users (id, display_name) values (${data.user.id}, 'Local integration operator')`;
        const probe = createClient<Database, "shagun">(API, current.anon, {
          db: { schema: "shagun" }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        });
        const login = await probe.auth.signInWithPassword({ email, password });
        if (login.error || !login.data.session) {
          const reason = login.error?.code && /^[a-z_]{1,80}$/.test(login.error.code) ? login.error.code : "unknown";
          throw new Error(`Isolated Auth credentials failed the direct GoTrue probe (${login.error?.status ?? 0}/${reason}).`);
        }
        const membership = await probe.rpc("is_admin", {});
        if (membership.error || membership.data !== (role === "ADMIN")) {
          const code = membership.error?.code && /^[A-Z0-9]{5,20}$/.test(membership.error.code) ? membership.error.code : "unexpected-result";
          throw new Error(`Isolated Auth membership failed the real PostgREST probe (${code}).`);
        }
        await probe.auth.signOut({ scope: "local" });
        identities[`SHAGUN_E2E_${role}_EMAIL_${width}`] = email;
        identities[`SHAGUN_E2E_${role}_PASSWORD_${width}`] = password;
        if (width === 390) {
          identities[`SHAGUN_E2E_${role}_EMAIL`] = email;
          identities[`SHAGUN_E2E_${role}_PASSWORD`] = password;
        }
      }
    }
    console.log("Fresh isolated schema and random test accounts ready. No hosted records or credentials used.");
    stage = "browser-workflows";
    command("node_modules/@playwright/test/cli.js", ["test", "--config", "playwright.integration.config.ts", ...process.argv.slice(3)], { ...env, ...identities });
  } finally {
    // Preserve an account if failed-test research still references it; never hide
    // a failed cleanup by deleting inventory outside the real user workflow.
    for (const id of users) {
      try {
        const [used] = await sql<{ exists: boolean }[]>`select exists(select 1 from shagun.venue_research where reviewed_by = ${id}) as exists`;
        if (!used.exists) await client.auth.admin.deleteUser(id);
      } catch { /* Local failed-run identity is retained for investigation. */ }
    }
    await sql.end();
  }
}

void main().catch((error: unknown) => {
  // SQL/Auth/CLI errors may carry credentials: never print raw provider objects.
  const safe = error instanceof Error && /^(Use integration|Local Supabase|Local integration|Unexpected local|Refusing|Integration |The dedicated|The local test|Unable to clear|Unexpected object|Isolated Auth|Fresh isolated)/.test(error.message);
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" && /^[A-Z0-9_]{1,40}$/.test(error.code) ? error.code : "REDACTED";
  console.error(safe ? error.message : `Isolated integration failed at ${stage} (${code}). Provider details withheld; no hosted database was targeted.`);
  process.exitCode = 1;
});