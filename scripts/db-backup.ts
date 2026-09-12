import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "postgres";
import { metadataSnapshotQuery } from "./db-catalog-snapshot";
import { SHARED_TABLES, connectionOptions, connectionTarget, parseArguments, sha256, type Fingerprint } from "./db-migration-plan";

// Explicit operator authorization: public-only export and disposable LOCAL restore.
// Never imported by builds; no migrations, seeds, managed restore or source writes.
// Business data is private, not encrypted: retain under protected local folder ACLs.
const ROOT = resolve(__dirname, "..");
const CONTAINER = "supabase_db_shagun-integration";
const IMAGE = "public.ecr.aws/supabase/postgres:17.6.1.165";
type Snapshot = { metadata: Record<string, string>; shared: Record<string, Fingerprint>; counts: Record<string, string> };
type RestoreErrorCategory = "duplicate-public-schema" | "missing-extension" | "missing-role" | "invalid-password/peer-auth" | "unsupported-config" | "other";
class RestoreFailure extends Error {
  readonly code: string | undefined;
  readonly category: RestoreErrorCategory;
  constructor(stderr: string) {
    super("Restore failed; details withheld.");
    // Match only a primary pg_restore diagnostic, never echoed SQL, CONTEXT or rows.
    const diagnostic = /^pg_restore: error: (?:could not execute query: (?:ERROR|FATAL):[ \t]+|connection to server [^\r\n]+ failed: (?:FATAL:[ \t]+)?)(?:([0-9A-Z]{5}):[ \t]+)?([^\r\n]*)\r?$/m.exec(stderr);
    this.code = diagnostic?.[1]; // Only an explicitly reported SQLSTATE, never inferred.
    const message = diagnostic?.[2] ?? "";
    const rules: readonly [RestoreErrorCategory, RegExp][] = [
      ["duplicate-public-schema", /^schema "public" already exists$/],
      ["missing-extension", /^(?:extension "[^"\r\n]+" (?:is not available|does not exist)|could not open extension control file "[^"\r\n]+": No such file or directory|could not access file "\$libdir\/[^"\r\n]+": No such file or directory)$/],
      ["missing-role", /^role "[^"\r\n]+" does not exist$/],
      ["invalid-password/peer-auth", /^(?:(?:password|Peer) authentication failed for user "[^"\r\n]+"|fe_sendauth: no password supplied)$/],
      ["unsupported-config", /^(?:unrecognized configuration parameter "[^"\r\n]+"|invalid value for parameter "[^"\r\n]+": "[^"\r\n]*"|parameter "[^"\r\n]+" cannot be changed (?:now|without restarting the server))$/],
    ];
    this.category = rules.find(([, pattern]) => pattern.test(message))?.[0] ?? "other";
  }
}
let stage = "arguments";
function requireSafe(condition: unknown, label: string): asserts condition {
  if (!condition) { stage = label; throw new Error("Operation refused; details withheld."); }
}
function command(label: string, file: string, args: string[], pg: Record<string, string> = {}, capture = false): string {
  stage = label;
  // No ambient database credentials, Node injection/debug flags or CLI access tokens.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMDATA|DOCKER_HOST|DOCKER_CONTEXT|DOCKER_CONFIG|DOCKER_CERT_PATH|DOCKER_TLS_VERIFY)$/i.test(key)));
  const result = spawnSync(file, args, { cwd: ROOT, env: { ...env, NODE_ENV: "production", SUPABASE_TELEMETRY_DISABLED: "1", ...pg },
    encoding: "utf8", windowsHide: true, maxBuffer: 2 * 1024 * 1024,
    stdio: ["ignore", capture ? "pipe" : "ignore", label === "pg-restore" ? "pipe" : "ignore"] });
  const failed = Boolean(result.error) || result.status !== 0;
  console.log(`stage=${label} exitCode=${result.status ?? -1}`);
  // Raw restore stderr stays in this bounded in-memory result, never in logs/artifacts.
  if (label === "pg-restore" && failed) throw new RestoreFailure(result.stderr ?? "");
  requireSafe(!failed, label);
  return result.stdout ?? ""; // Captures stay in memory; never echo them, even on failure.
}
const envFlags = (pg: Record<string, string>) => Object.keys(pg).flatMap((name) => ["-e", name]);
async function dumpDigest(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
async function fingerprints(tx: postgres.TransactionSql): Promise<Record<string, Fingerprint>> {
  await tx`set local row_security = off`; // Fail on filtering; never disables table RLS.
  const [shape] = await tx<{ n: number }[]>`select count(*)::int as n from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname::text = any(${tx.array([...SHARED_TABLES], 25)}::text[])
      and c.relkind in ('r', 'p') and not row_security_active(c.oid)`;
  requireSafe(shape?.n === SHARED_TABLES.length, "shared-table-shape");
  const shared: Record<string, Fingerprint> = {};
  for (const table of SHARED_TABLES) {
    stage = `fingerprint-${table}`;
    // Only count and a digest of bounded MD5 limb sums cross the wire, never rows.
    const [row] = await tx<Fingerprint[]>`with hashes as (select md5(to_jsonb(entry)::text) as h from public.${tx(table)} entry)
      select count(*)::text as count, md5(count(*)::text || ':' ||
        coalesce(sum(('x' || substr(h, 1, 8))::bit(32)::bigint), 0)::text || ':' ||
        coalesce(sum(('x' || substr(h, 9, 8))::bit(32)::bigint), 0)::text || ':' ||
        coalesce(sum(('x' || substr(h, 17, 8))::bit(32)::bigint), 0)::text || ':' ||
        coalesce(sum(('x' || substr(h, 25, 8))::bit(32)::bigint), 0)::text) as digest from hashes`;
    requireSafe(row && /^\d+$/.test(row.count) && /^[a-f0-9]{32}$/.test(row.digest), "fingerprint-invalid");
    shared[table] = { count: row.count, digest: row.digest };
  }
  return shared;
}
async function snapshot(sql: postgres.Sql, phase: string): Promise<Snapshot> {
  return sql.begin("isolation level repeatable read read only", async (tx) => {
    stage = `${phase}-managed-counts`;
    await tx`set local row_security = off`;
    const [counts] = await tx<Record<string, string>[]>`select (select count(*)::text from auth.users) as auth_users,
      (select count(*)::text from storage.objects) as storage_objects, (select count(*)::text from storage.buckets) as storage_buckets`;
    requireSafe(counts && Object.values(counts).every((n) => /^\d+$/.test(n)), "managed-counts-invalid");
    requireSafe(Object.values(counts).every((n) => n === "0"), "managed-backup-required");
    const metadata: Record<string, string> = {};
    for (const schema of ["public", "auth", "storage"] as const) {
      stage = `${phase}-metadata-${schema}`;
      const query = metadataSnapshotQuery(schema, false, false);
      const [row] = await tx.unsafe<{ snapshot: string }[]>(query.text, query.parameters);
      requireSafe(row && typeof row.snapshot === "string", "metadata-missing");
      metadata[schema] = row.snapshot;
    }
    return { metadata, counts: { ...counts }, shared: await fingerprints(tx) };
  });
}
async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  requireSafe(options.sourceEnv && !options.apply && !options.seed && options.expectedProjectRef === "ixkhyqqovacdramymqjk", "backup-only-arguments");
  requireSafe(process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "0" && !Object.keys(process.env).some((k) => /^VERCEL(?:_|$)/i.test(k)), "local-verified-tls-required");
  process.umask(0o077);
  stage = "private-paths";
  const qa = resolve(ROOT, ".qa"), ca = resolve(qa, "supabase-production-ca.crt"), parent = resolve(qa, "backups");
  for (const [path, directory] of [[qa, true], [ca, false]] as const) {
    const entry = await lstat(path);
    requireSafe(!entry.isSymbolicLink() && (directory ? entry.isDirectory() : entry.isFile()), "private-path-invalid");
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const names = ["public.dump", "before.json", "after.json", "restored.json", "manifest.json"];
  const paths = names.map((name) => `.qa/backups/${stamp}/${name}`);
  const ignored = command("check-private-ignore", "git", ["check-ignore", "--", ...paths], {}, true).trim().split(/\r?\n/);
  requireSafe(paths.every((path) => ignored.includes(path)), "private-output-not-ignored");
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const parentEntry = await lstat(parent);
  requireSafe(parentEntry.isDirectory() && !parentEntry.isSymbolicLink(), "private-path-invalid");
  const folder = resolve(parent, stamp), dump = resolve(folder, "public.dump");
  await mkdir(folder, { mode: 0o700 }); // Exclusive: collisions never overwrite an earlier run.
  const save = (name: string, value: unknown) => writeFile(resolve(folder, name), `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  const scratch = `shagun_restore_${randomBytes(4).toString("hex")}`, temporary = `/tmp/${scratch}`, copy = `${temporary}/public.dump`;
  let remote: postgres.Sql | undefined, local: postgres.Sql | undefined, restored: postgres.Sql | undefined;
  let before: Snapshot | undefined, checksum: string | null = null, container = "", created = false, temporaryOwned = false, verified = false;
  try {
    stage = "source-connection";
    const target = connectionTarget(options, { sourceText: await readFile(resolve(process.cwd(), options.sourceEnv), "utf8") });
    const base = connectionOptions(target, false);
    remote = postgres({ ...base, ssl: { ...base.ssl, ca: await readFile(ca, "utf8") } });
    before = await snapshot(remote, "before");
    await save("before.json", before);
    await writeFile(dump, "", { flag: "wx", mode: 0o600 });
    const pg = { PGHOST: target.host, PGPORT: String(target.port), PGUSER: target.user, PGPASSWORD: target.password,
      PGDATABASE: target.database, PGSSLMODE: "verify-full", PGSSLROOTCERT: "/certs/supabase-production-ca.crt", PGCONNECT_TIMEOUT: "15",
      PGOPTIONS: "-c default_transaction_read_only=on -c row_security=off -c statement_timeout=20000 -c lock_timeout=2000" };
    command("pg-dump", "docker", ["run", "--rm", "--pull=never", "--entrypoint=pg_dump", ...envFlags(pg),
      "--mount", `type=bind,source=${folder},target=/backup`, "--mount", `type=bind,source=${ca},target=/certs/supabase-production-ca.crt,readonly`,
      IMAGE, "--format=custom", "--schema=public", "--file=/backup/public.dump", "--no-password", "--lock-wait-timeout=2s"], pg);
    stage = "dump-sha256";
    checksum = await dumpDigest(dump);
    const after = await snapshot(remote, "after");
    await save("after.json", after);
    requireSafe(JSON.stringify(before) === JSON.stringify(after), "source-changed");
    const status: { DB_URL?: unknown } = JSON.parse(command("local-status", process.execPath,
      [resolve(ROOT, "node_modules/supabase/dist/supabase.js"), "status", "--workdir", "tests/local-stack", "-o", "json"], {}, true));
    requireSafe(typeof status?.DB_URL === "string", "local-status-invalid");
    const url = new URL(status.DB_URL);
    requireSafe(["postgres:", "postgresql:"].includes(url.protocol) && url.hostname === "127.0.0.1" && url.port === "55322"
      && url.pathname === "/postgres" && decodeURIComponent(url.username) === "postgres" && url.password && !url.search && !url.hash, "local-target-refused");
    const password = decodeURIComponent(url.password);
    requireSafe(!/[\r\n\0]/.test(password), "local-target-refused");
    const identity = command("inspect-local-container", "docker", ["inspect", "--type=container", "--format", "{{.Id}} {{.Name}} {{.State.Running}}", CONTAINER], {}, true).trim().split(" ");
    requireSafe(/^[a-f0-9]{64}$/.test(identity[0] ?? "") && identity[1] === `/${CONTAINER}` && identity[2] === "true", "local-container-refused");
    container = identity[0]; // Pin the inspected container, not a subsequently reused name.
    const localOptions = { ...base, host: "127.0.0.1", port: 55322, user: "postgres", password, database: "postgres", ssl: false as const,
      connection: { ...base.connection, default_transaction_read_only: false, application_name: "shagun-backup-local-restore" } };
    local = postgres(localOptions);
    const localPg = { PGHOST: "/var/run/postgresql", PGPORT: "5432", PGUSER: "postgres", PGPASSWORD: password, PGDATABASE: "postgres", PGSSLMODE: "disable", PGCONNECT_TIMEOUT: "15" };
    const exec = (label: string, args: string[], capture = false) => command(label, "docker", ["exec", "--user=postgres", ...envFlags(localPg), container, ...args], localPg, capture);
    // Bind the loopback SQL connection to the inspected cluster before any CREATE.
    stage = "local-cluster-identity";
    const [cluster] = await local<{ id: string }[]>`select system_identifier::text as id from pg_catalog.pg_control_system()`;
    requireSafe(cluster && exec("container-cluster-identity", ["psql", "-X", "-A", "-t", "--no-password", "--set=ON_ERROR_STOP=1", "-c", "select system_identifier from pg_catalog.pg_control_system()"], true).trim() === cluster.id, "local-cluster-mismatch");
    stage = "create-scratch";
    requireSafe(/^shagun_restore_[a-f0-9]{8}$/.test(scratch), "scratch-name-refused");
    await local`create database ${local(scratch)} template template0`;
    created = true; // Only confirmed creation authorizes DROP; never adopt a collision.
    exec("create-local-temporary", ["mkdir", "-m", "700", temporary]);
    temporaryOwned = true;
    command("copy-exact-dump", "docker", ["cp", "--", dump, `${container}:${copy}`]);
    command("local-copy-owner", "docker", ["exec", "--user=root", container, "chown", "postgres:postgres", copy]);
    exec("local-copy-private", ["chmod", "600", copy]);
    requireSafe(exec("local-copy-sha256", ["sha256sum", copy], true).split(/\s+/)[0] === checksum, "local-copy-mismatch");
    requireSafe(created, "scratch-not-created");
    stage = "drop-scratch-public";
    restored = postgres({ ...localOptions, database: scratch });
    // template0 can contain public; only this run's new scratch database is touched.
    // Let the unchanged archive recreate it. RESTRICT refuses unexpected contents.
    await restored`drop schema if exists public restrict`;
    exec("pg-restore", ["pg_restore", "--no-owner", "--no-privileges", "--exit-on-error", "--single-transaction", "--no-password", `--dbname=${scratch}`, copy]);
    stage = "restored-fingerprints";
    const shared = await restored.begin("isolation level repeatable read read only", (tx) => fingerprints(tx));
    await save("restored.json", { shared });
    requireSafe(JSON.stringify(shared) === JSON.stringify(before.shared) && await dumpDigest(dump) === checksum, "restore-mismatch");
    verified = true;
  } catch (error) {
    const failedStage = stage; // Report the primary failure before finally changes stage.
    const candidate = error !== null && typeof error === "object" && "code" in error ? error.code : undefined;
    const sqlstate = typeof candidate === "string" && /^[0-9A-Z]{5}$/.test(candidate) ? candidate : "unknown";
    const category = error instanceof RestoreFailure ? error.category : "other";
    console.error(`stage=${failedStage} exitCode=1 sqlstate=${sqlstate} category=${category}`);
    process.exitCode = 1;
  } finally {
    const cleanup = async (label: string, action: () => unknown) => {
      stage = label;
      try { await action(); } catch { verified = false; process.exitCode = 1; console.error(`stage=${label} exitCode=1`); }
    };
    if (restored) await cleanup("close-scratch", () => restored!.end({ timeout: 5 }));
    if (created && local) await cleanup("drop-created-scratch", () => local!`drop database ${local!(scratch)} with (force)`);
    if (temporaryOwned) {
      await cleanup("remove-local-copy", () => command("remove-local-copy", "docker", ["exec", "--user=postgres", container, "rm", "-f", "--", copy]));
      await cleanup("remove-local-temporary", () => command("remove-local-temporary", "docker", ["exec", "--user=postgres", container, "rmdir", "--", temporary]));
    }
    if (local) await cleanup("close-local", () => local!.end({ timeout: 5 }));
    if (remote) await cleanup("close-source", () => remote!.end({ timeout: 5 }));
    stage = "private-manifest";
    await save("manifest.json", { verified, sha256: checksum,
      counts: before ? { ...before.counts, ...Object.fromEntries(SHARED_TABLES.map((table) => [table, before!.shared[table].count])) } : null,
      metadataDigest: before ? sha256(JSON.stringify(before.metadata)) : null, checkedAt: new Date().toISOString(),
      scope: { projectRef: options.expectedProjectRef, schema: "public", fingerprintedTables: SHARED_TABLES, localScratch: scratch,
        limitations: "Public-schema restore only, without owners/ACLs. Auth/Storage logical metadata retained, not managed identities, settings or object bytes. Not a complete project recovery backup." } });
    console.log(`stage=${verified ? "verified-public-restore" : "unverified-artifacts-retained"} exitCode=${verified ? 0 : 1}`);
  }
}
if (require.main === module) void main().catch(() => { console.error(`stage=${stage} exitCode=1`); process.exitCode = 1; });