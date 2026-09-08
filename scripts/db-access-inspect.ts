import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "postgres";
import { connectionOptions, connectionTarget, parseArguments, safeTarget, SafeError, sanitizedFailure } from "./db-migration-plan";

/** Read-only troubleshooting of migration prerequisites; never reads Auth records or secrets from SQL. */
async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.apply || options.seed) throw new SafeError("ARGUMENTS");
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") throw new SafeError("TLS_CONFIGURATION");
  const target = connectionTarget(options, {
    sourceText: options.sourceEnv ? await readFile(resolve(options.sourceEnv), "utf8") : undefined,
    environmentUrl: options.sourceEnv ? undefined : process.env.SHAGUN_DATABASE_URL,
  });
  const sql = postgres(connectionOptions(target, false));
  try {
    const flags = await sql.begin("read only", async (tx) => tx`
      select
        has_database_privilege(current_user, current_database(), 'CREATE') as create_objects,
        has_schema_privilege(current_user, 'auth', 'USAGE') as auth_usage,
        has_schema_privilege(current_user, 'storage', 'USAGE') as storage_usage,
        has_table_privilege(current_user, 'auth.users', 'SELECT') as auth_read,
        has_table_privilege(current_user, 'auth.users', 'REFERENCES') as auth_reference,
        has_function_privilege(current_user, 'auth.uid()', 'EXECUTE') as auth_uid,
        has_table_privilege(current_user, 'storage.buckets', 'SELECT') as bucket_read,
        has_table_privilege(current_user, 'storage.buckets', 'INSERT') as bucket_insert,
        has_table_privilege(current_user, 'storage.objects', 'SELECT') as storage_read,
        (select pg_has_role(current_user, relowner, 'USAGE') from pg_class
          where oid = 'storage.objects'::regclass) as storage_owner_usage,
        (select pg_has_role(current_user, relowner, 'MEMBER') from pg_class
          where oid = 'storage.objects'::regclass) as storage_owner_member,
        exists(select 1 from pg_settings where name = 'supautils.policy_grants'
          and (nullif(setting, '')::jsonb -> current_user) ? 'storage.objects') as storage_policy_manager,
        exists(select 1 from pg_namespace where nspname = 'shagun') as shagun_exists
    `);
    console.log(JSON.stringify({ status: "read-only-access-diagnostics", target: safeTarget(target), flags }, null, 2));
  } finally { await sql.end({ timeout: 5 }); }
}

void main().catch((error: unknown) => {
  console.error(JSON.stringify({ status: "failed", ...sanitizedFailure(error) }));
  process.exitCode = 1;
});