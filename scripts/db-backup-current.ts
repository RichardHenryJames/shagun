import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { lstat, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import { isDeepStrictEqual } from "node:util";
import postgres from "postgres";
import { z } from "zod";
import { connectionOptions, connectionTarget, MIGRATION_FILES, STORAGE_POLICIES } from "./db-migration-plan";
import { CURRENT_BACKUP_TABLES, currentBackupSnapshotSql } from "./db-backup-snapshot";
import { MAX_BACKUP_BYTES, openBackup, sealBackup } from "./backup-envelope";
import { normalizedConstraintMetadata, slugConstraintNormalizationSql } from "./backup-constraint-normalization";

// Separate from the historical public-only backup helper. No build/import hook.
// Remote access is read-only; plaintext never goes to a host file. The archive
// deliberately excludes sibling rows, managed Auth records/passwords and secrets.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT = "ixkhyqqovacdramymqjk";
const IMAGE = "sha256:28f0e16a019e648089fc1a6d333549a55548f6019c15ae4bd7cd58b989027518";
const OWNER = "Parimal";
const SETTINGS = "set search_path=pg_catalog; set timezone='UTC'; set datestyle='ISO, YMD'; set intervalstyle=postgres; set extra_float_digits=3; set bytea_output=hex; set standard_conforming_strings=on; set row_security=off;";
const fingerprintSchema = z.object({ count: z.string().regex(/^\d+$/), digest: z.string().regex(/^[a-f0-9]{32}$/) });
const snapshotSchema = z.object({ data: z.record(z.string(), fingerprintSchema), metadata: z.record(z.string(), z.unknown()) });
type Snapshot = z.infer<typeof snapshotSchema>;
const bundleSchema = z.object({
  version: z.literal(1), projectRef: z.literal(PROJECT), recoveryOwner: z.literal(OWNER), capturedAt: z.iso.datetime(),
  sourceRevision: z.string().regex(/^[a-f0-9]{40}$/), serverVersion: z.string(), dumpSha256: z.string().regex(/^[a-f0-9]{64}$/),
  archiveBase64: z.string(), snapshot: snapshotSchema, referenceBootstrapSql: z.string(),
  storageMetadata: z.unknown(), migrationSources: z.array(z.object({ name: z.string(), checksum: z.string(), sql: z.string() })),
  limitations: z.array(z.string()),
}).strict();
type Bundle = z.infer<typeof bundleSchema>;
const LIMITATIONS = [
  "Local project-root copy only; not off-device or independently retained.",
  "AES-256-GCM key is Windows DPAPI CurrentUser protected; this Windows profile is required to decrypt. It is not portable recovery-key escrow.",
  "Current shagun/shagun_private PostgreSQL schemas, rows, exact timestamps, ledger, SQL functions, ownership, ACLs and RLS only.",
  "No sibling business rows, Auth user/password/session records, managed Auth configuration, global roles/passwords, hosting secrets or project-wide backup.",
  "SQL restore uses auth.users UUID reference stubs and the source auth.uid SQL definition, not functioning or verified Auth accounts.",
  "Shagun Storage configuration/policy metadata is included; object-byte backup is refused unless the current bucket has zero objects and there are no media/cleanup records.",
  "SQL-only local restore does not prove managed REST/Auth/Storage recovery, key/session recovery, off-device survival, concurrency or release readiness.",
];
let stage = "arguments";

function requireSafe(condition: unknown, label: string): asserts condition {
  if (!condition) { stage = label; throw new Error("Backup refused; details withheld."); }
}
const digest = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");

function childEnvironment(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const allow = /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMDATA|DOCKER_HOST|DOCKER_CONTEXT|DOCKER_CONFIG|DOCKER_CERT_PATH|DOCKER_TLS_VERIFY)$/i;
  return { ...Object.fromEntries(Object.entries(process.env).filter(([name]) => allow.test(name))), ...extra, NODE_ENV: "production" };
}

// Never expose provider stderr, SQL, rows, child input, environment values or keys.
function command(label: string, executable: string, args: string[], input?: Buffer, extra: Record<string, string> = {}): Buffer {
  stage = label;
  const result = spawnSync(executable, args, { cwd: ROOT, shell: false, windowsHide: true,
    env: childEnvironment(extra), input, timeout: 120_000, maxBuffer: MAX_BACKUP_BYTES });
  requireSafe(!result.error && result.status === 0, label);
  return result.stdout;
}

// The remote connection must keep processing while pg_dump owns the exported
// snapshot. Synchronous subprocesses here could starve its socket/timeout work.
async function asyncCommand(label: string, executable: string, args: string[], extra: Record<string, string>): Promise<Buffer> {
  stage = label;
  return new Promise((accept, reject) => {
    const child = spawn(executable, args, { cwd: ROOT, shell: false, windowsHide: true,
      env: childEnvironment(extra), stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let size = 0;
    let failed = false;
    const timer = setTimeout(() => { failed = true; child.kill(); }, 120_000);
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BACKUP_BYTES) { failed = true; child.kill(); }
      else chunks.push(chunk);
    });
    child.stderr.resume();
    child.once("error", () => { failed = true; });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (failed || code !== 0) reject(new Error("Backup subprocess failed; details withheld."));
      else accept(Buffer.concat(chunks));
    });
  });
}

function protectedKey(operation: "protect" | "unprotect", key: Buffer): Buffer {
  const output = command(`key-${operation}`, "pwsh", ["-NoLogo", "-NoProfile", "-NonInteractive", "-File",
    resolve(ROOT, "scripts/backup-key.ps1"), "-Operation", operation], Buffer.from(key.toString("base64")));
  const text = output.toString("ascii").trim();
  requireSafe(/^[A-Za-z0-9+/]+={0,2}$/.test(text) && text.length < 16384, "key-envelope-invalid");
  output.fill(0);
  return Buffer.from(text, "base64");
}

function validateSnapshot(text: string): Snapshot {
  const result = snapshotSchema.parse(JSON.parse(text));
  requireSafe(Object.keys(result.data).sort().join(",") === [...CURRENT_BACKUP_TABLES].sort().join(","), "snapshot-table-scope");
  const relations = result.metadata.relations;
  requireSafe(Array.isArray(relations) && relations.length === CURRENT_BACKUP_TABLES.length, "snapshot-relation-scope");
  return result;
}

/** Diagnostics expose only structural field paths, never SQL or private values. */
function differingPaths(left: unknown, right: unknown, path = "metadata", found: string[] = []): string[] {
  if (found.length >= 40 || isDeepStrictEqual(left, right)) return found;
  if (left !== null && right !== null && typeof left === "object" && typeof right === "object"
      && Array.isArray(left) === Array.isArray(right)) {
    const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      differingPaths(a[key], b[key], `${path}.${key}`, found);
    }
  } else found.push(path);
  return found;
}

async function rootFile(path: string): Promise<string> {
  const full = resolve(ROOT, path);
  requireSafe(dirname(full) === ROOT && /^shagun-backup-[a-zA-Z0-9-]+\.enc$/.test(basename(full)), "backup-root-path");
  const stat = await lstat(full);
  requireSafe(stat.isFile() && !stat.isSymbolicLink() && stat.size <= MAX_BACKUP_BYTES + 20_000, "backup-file-invalid");
  return full;
}

async function capture(sourceEnv: string): Promise<Bundle> {
  const ca = resolve(ROOT, ".qa/supabase-production-ca.crt");
  requireSafe((await lstat(ca)).isFile() && !(await lstat(ca)).isSymbolicLink(), "public-ca-path");
  const target = connectionTarget({ sourceEnv, expectedProjectRef: PROJECT, apply: false, seed: false },
    { sourceText: await readFile(resolve(ROOT, sourceEnv), "utf8") });
  const options = connectionOptions(target, false);
  const sql = postgres({ ...options, ssl: { ...options.ssl, ca: await readFile(ca, "utf8") },
    connection: { ...options.connection, application_name: "shagun-local-current-backup" } });
  try {
    return await sql.begin("isolation level repeatable read read only", async (tx) => {
      stage = "source-scope";
      await tx`set local row_security = off`;
      await tx`set local idle_in_transaction_session_timeout = '120s'`;
      const [server] = await tx<{ version: string; version_number: number; relation_count: number; unsupported: number }[]>`
        select version() as version, current_setting('server_version_num')::int as version_number,
          (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace
            where n.nspname in ('shagun','shagun_private') and c.relkind in ('r','p','v','m','S','f')) as relation_count,
          (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace
            where n.nspname in ('shagun','shagun_private') and c.relkind in ('p','v','m','S','f')) as unsupported`;
      requireSafe(server && server.version_number >= 170000 && server.version_number < 180000
        && server.relation_count === 11 && server.unsupported === 0, "source-version-or-shape");
      const [raw] = await tx.unsafe<{ snapshot: string }[]>(currentBackupSnapshotSql());
      requireSafe(raw && typeof raw.snapshot === "string", "source-snapshot-missing");
      const snapshot = validateSnapshot(raw.snapshot);
      for (const table of ["media_assets", "storage_cleanup_jobs"]) {
        requireSafe(snapshot.data[`shagun.${table}`].count === "0", "object-byte-or-pending-cleanup-backup-required");
      }
      const [storageCount] = await tx<{ n: string }[]>`select count(*)::text as n from storage.objects where bucket_id='shagun-media'`;
      requireSafe(storageCount?.n === "0", "object-byte-backup-required");
      const [storage] = await tx<{ value: unknown }[]>`select jsonb_build_object(
        'bucket', (select jsonb_build_object('id',id,'name',name,'public',public,'file_size_limit',file_size_limit,
          'allowed_mime_types',allowed_mime_types) from storage.buckets where id='shagun-media'),
        'policies', (select jsonb_agg(to_jsonb(p) order by p.policyname collate "C") from pg_policies p
          where p.schemaname='storage' and p.tablename='objects' and p.policyname=any(${tx.array([...STORAGE_POLICIES], 25)}::text[])),
        'objectCount', 0) as value`;
      const references = await tx<{ id: string }[]>`select id::text from shagun.admin_users order by id limit 101`;
      requireSafe(references.length <= 100 && references.every((row) => /^[a-f0-9-]{36}$/.test(row.id)), "reference-uuid-budget");
      const [uid] = await tx<{ definition: string }[]>`select pg_get_functiondef(to_regprocedure('auth.uid()')) as definition`;
      requireSafe(uid && typeof uid.definition === "string" && uid.definition.length < 8000, "auth-uid-reference-unavailable");
      const ledger = await tx<{ version: string; checksum: string }[]>`select version, checksum from shagun_private.schema_migrations order by version`;
      requireSafe(ledger.length === MIGRATION_FILES.length, "ledger-length");
      const migrationSources: Bundle["migrationSources"] = [];
      for (const [index, name] of MIGRATION_FILES.entries()) {
        const bytes = await readFile(resolve(ROOT, "supabase/migrations", name));
        const checksum = digest(bytes);
        requireSafe(ledger[index].version === name.slice(0, 4) && ledger[index].checksum === checksum, "ledger-checksum");
        migrationSources.push({ name, checksum, sql: bytes.toString("utf8") });
      }
      const referenceBootstrapSql = `-- ISOLATED SQL REFERENCE STUBS ONLY: NOT MANAGED AUTH RECOVERY.\n${SETTINGS}\n`
        + "create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;\n"
        + "create schema auth authorization postgres; create table auth.users(id uuid primary key);\n"
        + references.map(({ id }) => `insert into auth.users(id) values ('${id}'::uuid);`).join("\n") + "\n"
        + uid.definition + ";\ngrant usage on schema auth to anon, authenticated, service_role;\n";
      const [exported] = await tx<{ id: string; captured_at: string }[]>`select pg_export_snapshot() as id,
        to_char(transaction_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as captured_at`;
      requireSafe(exported && /^[0-9A-Fa-f-]+$/.test(exported.id), "exported-snapshot-invalid");
      const pg = { PGHOST: target.host, PGPORT: "5432", PGUSER: target.user, PGPASSWORD: target.password,
        PGDATABASE: "postgres", PGSSLMODE: "verify-full", PGSSLROOTCERT: "/certs/ca.crt", PGCONNECT_TIMEOUT: "15",
        PGOPTIONS: "-c default_transaction_read_only=on -c row_security=off -c statement_timeout=20000 -c lock_timeout=2000" };
      const dump = await asyncCommand("pg-dump-consistent-snapshot", "docker", ["run", "--rm", "--pull=never", "--entrypoint=pg_dump",
        ...Object.keys(pg).flatMap((name) => ["-e", name]), "--mount", `type=bind,source=${ca},target=/certs/ca.crt,readonly`, IMAGE,
        "--format=custom", "--schema=shagun", "--schema=shagun_private", "--no-password", "--lock-wait-timeout=2s",
        `--snapshot=${exported.id}`], pg);
      requireSafe(dump.subarray(0, 5).toString("ascii") === "PGDMP" && dump.length < MAX_BACKUP_BYTES / 2, "native-dump-invalid");
      const revision = command("source-revision", "git", ["rev-parse", "HEAD"]).toString("ascii").trim();
      const result = bundleSchema.parse({ version: 1, projectRef: PROJECT, recoveryOwner: OWNER, capturedAt: exported.captured_at,
        sourceRevision: revision, serverVersion: server.version, dumpSha256: digest(dump), archiveBase64: dump.toString("base64"),
        snapshot, referenceBootstrapSql, storageMetadata: storage.value, migrationSources, limitations: LIMITATIONS });
      dump.fill(0);
      return result;
    });
  } finally { await sql.end({ timeout: 5 }); }
}

function restoreLocally(bundle: Bundle): { dataMatched: true; metadataMatched: true; rootContainer: string } {
  const name = `shagun-backup-restore-${randomBytes(8).toString("hex")}`;
  const nonce = randomBytes(16).toString("hex");
  const archive = Buffer.from(bundle.archiveBase64, "base64");
  requireSafe(digest(archive) === bundle.dumpSha256 && archive.subarray(0, 5).toString("ascii") === "PGDMP", "archive-integrity");
  const payload = (name: string, value: Buffer) => `base64 -d > /tmp/${name} <<'SHAGUN_BASE64'\n${value.toString("base64")}\nSHAGUN_BASE64\n`;
  const script = "set -eu\numask 077\n"
    + payload("shagun.dump", archive)
    + payload("bootstrap.sql", Buffer.from(bundle.referenceBootstrapSql))
    + payload("verify.sql", Buffer.from(`${SETTINGS}\n${currentBackupSnapshotSql()}\n${slugConstraintNormalizationSql(bundle.snapshot.metadata)}`))
    + "initdb -D /backup-db -U postgres --auth-local=trust --auth-host=reject --encoding=UTF8 --locale=C >/tmp/init.log 2>&1\n"
    + "pg_ctl -D /backup-db -l /tmp/postgres.log -o \"-c listen_addresses='' -c unix_socket_directories=/tmp\" -w -t 30 start >/tmp/start.log 2>&1\n"
    + "trap 'pg_ctl -D /backup-db -m immediate -w stop >/dev/null 2>&1 || true' EXIT\n"
    + "export PGHOST=/tmp PGUSER=postgres PGDATABASE=postgres\n"
    + "psql -X --no-password -q -v ON_ERROR_STOP=1 -f /tmp/bootstrap.sql >/tmp/bootstrap.log 2>&1\n"
    + "pg_restore --no-password --exit-on-error --single-transaction --dbname=postgres /tmp/shagun.dump >/tmp/restore.log 2>&1\n"
    + "psql -X --no-password -q -A -t -v ON_ERROR_STOP=1 -f /tmp/verify.sql\n";
  try {
    // No ports, network, host-data mounts, privileged capabilities or existing
    // integration stack. Plaintext files and DB exist only in this tmpfs sandbox.
    const result = command("isolated-sql-restore", "docker", ["run", "--rm", "-i", "--pull=never", "--name", name,
      "--label", `shagun.backup.owner=${nonce}`, "--network=none", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges",
      "--user=100:101", "--memory=768m", "--cpus=2", "--pids-limit=160",
      "--tmpfs", "/backup-db:rw,nosuid,nodev,mode=0700,uid=100,gid=101", "--tmpfs", "/tmp:rw,nosuid,nodev,mode=1777",
      "--entrypoint=sh", IMAGE, "-s"], Buffer.from(script));
    const lines = result.toString("utf8").trim().split(/\r?\n/);
    requireSafe(lines.length === 2, "restore-comparison-output");
    const restored = validateSnapshot(lines[0]);
    const comparison = normalizedConstraintMetadata(bundle.snapshot.metadata, restored.metadata, JSON.parse(lines[1]));
    result.fill(0);
    requireSafe(isDeepStrictEqual(restored.data, bundle.snapshot.data), "restored-data-mismatch");
    if (!isDeepStrictEqual(comparison.source, comparison.restored)) {
      console.error(JSON.stringify({ differingMetadataFields: differingPaths(comparison.source, comparison.restored) }));
    }
    requireSafe(isDeepStrictEqual(comparison.source, comparison.restored), "restored-metadata-mismatch");
    return { dataMatched: true, metadataMatched: true, rootContainer: name };
  } finally {
    archive.fill(0);
    // If a bounded subprocess failed, clean only the exact randomly named and
    // labelled container from this invocation; never stop an existing stack.
    const inspection = spawnSync("docker", ["inspect", "--format", '{{index .Config.Labels "shagun.backup.owner"}}', name],
      { env: childEnvironment(), windowsHide: true, timeout: 15_000, maxBuffer: 8192 });
    if (inspection.status === 0 && inspection.stdout.toString("ascii").trim() === nonce) {
      command("cleanup-owned-restore", "docker", ["rm", "--force", name]);
    } else requireSafe(inspection.status === 1, "restore-cleanup-unconfirmed");
  }
}

async function main() {
  requireSafe(process.platform === "win32" && process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "0"
    && !Object.keys(process.env).some((key) => /^VERCEL(?:_|$)/i.test(key)), "windows-local-verified-tls-required");
  const args = process.argv.slice(2);
  const verifying = args[0] === "--verify-backup";
  requireSafe((verifying && args.length === 2) || (args.length === 6 && args[0] === "--source-env"
    && args[2] === "--expected-project-ref" && args[3] === PROJECT && args[4] === "--recovery-owner" && args[5] === OWNER), "arguments");
  requireSafe(command("pinned-postgres-image", "docker", ["image", "inspect", IMAGE, "--format", "{{.Id}}"])
    .toString("ascii").trim() === IMAGE, "postgres-image-mismatch");
  let file: string;
  let bundle: Bundle;
  if (verifying) {
    file = await rootFile(args[1]);
    const plaintext = openBackup(await readFile(file), (key) => protectedKey("unprotect", key));
    try { bundle = bundleSchema.parse(JSON.parse(gunzipSync(plaintext, { maxOutputLength: MAX_BACKUP_BYTES }).toString("utf8"))); }
    finally { plaintext.fill(0); }
  } else {
    const name = `shagun-backup-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomBytes(4).toString("hex")}.enc`;
    file = resolve(ROOT, name);
    const ignored = command("root-artifact-git-ignore", "git", ["check-ignore", "--", name, name.replace(/\.enc$/, ".manifest.json")])
      .toString("utf8").trim().split(/\r?\n/);
    requireSafe(ignored.length === 2, "root-artifacts-not-ignored");
    bundle = await capture(args[1]);
    const plaintext = gzipSync(Buffer.from(JSON.stringify(bundle)));
    let sealed: Buffer;
    try { sealed = sealBackup(plaintext, (key) => protectedKey("protect", key)); }
    finally { plaintext.fill(0); }
    await writeFile(file, sealed, { flag: "wx", mode: 0o600 });
    const reopened = openBackup(await readFile(await rootFile(file)), (key) => protectedKey("unprotect", key));
    try {
      const recovered = bundleSchema.parse(JSON.parse(gunzipSync(reopened, { maxOutputLength: MAX_BACKUP_BYTES }).toString("utf8")));
      requireSafe(isDeepStrictEqual(recovered, bundle), "encrypted-file-roundtrip");
      bundle = recovered;
    } finally { reopened.fill(0); sealed.fill(0); }
  }
  const validation = restoreLocally(bundle);
  const receipt = { version: 1, recoveryOwner: OWNER, file: basename(file), capturedAt: bundle.capturedAt,
    verifiedAt: new Date().toISOString(), encryptedFileSha256: digest(await readFile(file)), nativeArchiveSha256: bundle.dumpSha256,
    sourceRevision: bundle.sourceRevision, sourceProject: PROJECT, sourceSchemas: ["shagun", "shagun_private"],
    sourceReadOnly: true, consistentExportedSnapshot: true, decryptionRoundtripVerified: true,
    restoredDataMatched: validation.dataMatched, restoredNamedMetadataMatched: validation.metadataMatched,
    constraintNormalization: "Two slug CHECK definitions compared through independently verified PostgreSQL parse/deparse fixed points; all other metadata compared unchanged",
    ownersAndAclsRestored: true, isolatedSqlOnly: true, localContainerRemoved: true,
    tableCounts: Object.fromEntries(Object.entries(bundle.snapshot.data).map(([name, value]) => [name, value.count])),
    offDeviceCopy: false, managedAuthRestored: false, managedStorageRestored: false, completeRecovery: false,
    keyProtection: "Windows DPAPI CurrentUser; requires the current Windows profile", limitations: bundle.limitations };
  const manifestPath = file.replace(/\.enc$/, ".manifest.json");
  const existingManifest = await lstat(manifestPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  requireSafe(!existingManifest || (verifying && existingManifest.isFile() && !existingManifest.isSymbolicLink()), "existing-manifest-invalid");
  if (!existingManifest) await writeFile(manifestPath, JSON.stringify(receipt, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ status: "encrypted-local-sql-backup-verified", ...receipt }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch(() => {
    console.error(JSON.stringify({ status: "backup-not-verified", stage, detailsWithheld: true,
      next: "Inspect any existing encrypted root artifact before retrying. No automatic retry, remote restore or public-release approval." }));
    process.exitCode = 1;
  });
}