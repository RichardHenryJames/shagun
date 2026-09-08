import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { parse } from "dotenv";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  MIGRATION_FILES, SHARED_TABLES, STORAGE_POLICIES, SafeError, assertPreserved, assertStorageState,
  buildMigrations, connectionOptions, connectionTarget, exposedSchemas, migrationPlan, parseArguments,
  readMigrationSources, safeTarget, sanitizedFailure, sha256, sqlStatements, validateMigrationSource, validateSeed,
  type CliOptions, type LedgerRow, type Migration, type MigrationFile, type NamespaceState,
  type PreservationSnapshot, type SafeErrorCode,
} from "../../scripts/db-migration-plan";

// This suite never imports the executable runner or opens a socket. The only
// real file reads are the four checked-in SQL sources, seed and planner source.
// URLs/passwords below are synthetic parser inputs, NOT ambient credentials.
vi.mock("postgres", () => { throw new Error("Database clients are forbidden in planner unit tests."); });
const directory = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));
let sources: { filename: MigrationFile; sql: string }[];
let seed: string;
let plannerSource: string;
beforeAll(async () => {
  sources = await Promise.all(MIGRATION_FILES.map(async (filename) => ({ filename, sql: await readFile(resolve(directory, filename), "utf8") })));
  seed = await readFile(new URL("../../supabase/seed.sql", import.meta.url), "utf8");
  plannerSource = await readFile(new URL("../../scripts/db-migration-plan.ts", import.meta.url), "utf8");
});

function source(filename: MigrationFile) {
  const entry = sources.find((entry) => entry.filename === filename);
  if (!entry) throw new Error("Missing checked-in test input.");
  return entry.sql;
}
function expectCode(operation: () => unknown, code: SafeErrorCode) {
  expect(operation).toThrow(SafeError);
  expect(operation).toThrow(expect.objectContaining({ code }));
}
function replaceOnce(sql: string, before: string, after: string) {
  expect(sql).toContain(before);
  return sql.replace(before, after);
}
function inventoryFunction(name: string) {
  const statement = sqlStatements(source("0001_inventory.sql")).find((statement) => statement.text.startsWith(`create function ${name}(`));
  if (!statement) throw new Error("Missing reviewed function fixture.");
  return statement.text;
}
function sqlFunction(body: string) {
  return `create function shagun_private.valid_metadata(p_value jsonb)
    returns boolean language sql immutable set search_path = '' as $$ ${body} $$;`;
}
function plpgsqlFunction(body: string) {
  return `create function shagun_private.require_admin()
    returns void language plpgsql stable security invoker set search_path = '' as $$ begin ${body} end; $$;`;
}

describe("checked-in migration source review", () => {
  it.each(MIGRATION_FILES)("accepts every actual statement in %s", (filename) => {
    const sql = source(filename);
    const statements = sqlStatements(sql);
    expect(statements.length).toBeGreaterThan(0);
    // Report the individual statement on failure, not just the entire file.
    if (filename !== "0002_storage.sql") {
      for (const statement of statements) {
        expect(() => validateMigrationSource(filename, statement.text), statement.code).not.toThrow();
      }
    }
    expect(validateMigrationSource(filename, sql)).toEqual(statements);
  });

  it("accepts the Storage preflight's actual in-body comment without removing it from execution text", () => {
    const statements = validateMigrationSource("0002_storage.sql", source("0002_storage.sql"));
    expect(statements).toHaveLength(8);
    expect(statements[0].bodies).toHaveLength(1);
    expect(statements[0].text).toContain("-- A comma-separated privilege list means ANY privilege, not ALL. Check each.");
    expect(statements[0].code).toBe("do $body$");
  });

  it.each(["\n", "\r\n"])("accepts benign comments and %j formatting, including inside dollar bodies", (newline) => {
    for (const filename of MIGRATION_FILES) {
      let sql = source(filename).replace(/\r\n/g, "\n");
      sql = sql.replace(/^create function /gm, "create /* benign /* nested */ comment */ function ")
        .replace(/^grant /gm, "grant -- comments are not grants to public\n ")
        .replace(/(\$(?:shagun_storage_preflight)?\$)\n/g, "$1\n-- commit; DROP public.example; are comment text\n");
      sql = `-- leading comment\n${sql}\n/* trailing /* nested */ comment */\n-- EOF`;
      sql = sql.replace(/\n/g, newline);
      expect(() => validateMigrationSource(filename, sql), filename).not.toThrow();
    }
  });

  it.each(["shagun_private.valid_metadata", "shagun_private.media_changing", "shagun.save_venue", "shagun.consume_rate_limit"])(
    "does not mistake CASE/PLpgSQL END or ON CONFLICT in %s for transaction control", (name) => {
      const sql = inventoryFunction(name);
      expect(sql).toMatch(/\bcase\b/);
      expect(validateMigrationSource("0001_inventory.sql", sql)).toHaveLength(1);
    },
  );

  it.each(["shagun", "shagun_private", "shagun, shagun_private"])("accepts only reviewed schema ACLs for %s", (schemas) => {
    expect(validateMigrationSource("0001_inventory.sql", `
      revoke all on schema ${schemas} from public, anon, authenticated, service_role;
      grant usage on schema ${schemas} to anon, authenticated, service_role;`)).toHaveLength(2);
  });

  it.each(["anon", "authenticated", "service_role"])("accepts a private-schema USAGE grant to the exact %s role", (role) => {
    expect(validateMigrationSource("0001_inventory.sql", `GRANT /* benign */ USAGE ON SCHEMA shagun_private TO ${role};`)).toHaveLength(1);
  });

  it("builds the four migrations in order without changing their exact UTF-8 checksums", async () => {
    const original = sources.map((entry) => ({ ...entry }));
    const migrations = buildMigrations([...sources].reverse());
    expect(migrations.map(({ filename }) => filename)).toEqual(MIGRATION_FILES);
    expect(migrations.map(({ version }) => version)).toEqual(["0001", "0002", "0003", "0004"]);
    expect(migrations.map(({ checksum }) => checksum)).toEqual(sources.map(({ sql }) => createHash("sha256").update(sql, "utf8").digest("hex")));
    expect(sources).toEqual(original);
    expect(await readMigrationSources(directory)).toEqual(migrations);
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("normalizes review tokens, never ledger checksum bytes", () => {
    const lf = sources.map(({ filename, sql }) => ({ filename, sql: sql.replace(/\r\n/g, "\n") }));
    const crlf = lf.map(({ filename, sql }) => ({ filename, sql: sql.replace(/\n/g, "\r\n") }));
    const first = buildMigrations(lf);
    const second = buildMigrations(crlf);
    for (let index = 0; index < first.length; index++) {
      expect(first[index].checksum).not.toBe(second[index].checksum);
      expectCode(() => migrationPlan(second, { shagun: true, private: true, ledger: true },
        first.slice(0, index + 1).map(({ version, checksum }) => ({ version, checksum }))), "LEDGER_CHECKSUM");
    }
  });

  it("refuses missing, duplicate, extra or renamed filenames before examining SQL", () => {
    for (const entries of [sources.slice(1), [...sources, sources[0]],
      [...sources.slice(0, 3), sources[0]], [...sources, { filename: "0005_extra.sql", sql: "select 1;" }],
      sources.map((entry, index) => index ? entry : { ...entry, filename: "0001_renamed.sql" })]) {
      expectCode(() => buildMigrations(entries), "SQL_FILES");
    }
    expectCode(() => validateMigrationSource("unreviewed.sql" as MigrationFile, "create schema shagun;"), "SQL_FILES");
    expectCode(() => validateMigrationSource("0001_inventory.sql", source("0003_sitemap.sql")), "SQL_REVIEW");
  });
});

describe("fail-closed SQL surface", () => {
  it.each([
    "", "-- comments only", "not SQL", "select 1;", "with x as (select 1) select * from x;",
    "create schema arbitrary;", "create schema shagun_extra;", "create schema shagun_private_extra;",
    "create table public.example (id integer);", "create table auth.example (id integer);",
    "create table storage.example (id integer);", "create table arbitrary.example (id integer);",
    "create table shagun.unreviewed (id integer);", "create table shagun_private.schema_migrations (version text);",
    "insert into public.example values (1);", "delete from auth.users;", "update storage.objects set name = 'other';",
    "insert into shagun.cities (name) values ('unreviewed seed');", "alter table shagun.cities disable row level security;",
    "grant usage on schema shagun_private, public to anon, authenticated, service_role;",
    "grant usage on schema shagun_private_extra to anon, authenticated, service_role;",
    "grant create on schema shagun_private to anon, authenticated, service_role;",
    "grant usage on schema shagun_private to public;",
    "grant usage on schema shagun_private to unreviewed;",
    "grant usage on schema shagun_private, shagun_private to authenticated;",
    "grant usage on schema shagun_private to authenticated, authenticated;",
    "grant usage on schema shagun_private to anon, authenticated, service_role with grant option;",
    "grant select on shagun.cities, arbitrary.example to anon;",
    "grant all on all functions in schema shagun_private to anon;",
    "alter default privileges in schema public grant all on tables to anon;", "set role postgres;",
    "create extension dblink;", "create role unreviewed;", "copy public.example to program 'no-execution';",
    "do $$ begin perform 1; end; $$;", "create policy unreviewed on shagun.cities using (true);",
    "create index unreviewed on shagun.cities (name);", "create schema sha/* split identifier */gun;",
    'create schema "shagun";', 'create schema U&"shagun";', "\\i other.sql", "create schema shagun\0;",
  ])("refuses unreviewed top-level SQL: %s", (sql) => {
    expectCode(() => validateMigrationSource("0001_inventory.sql", sql), "SQL_REVIEW");
  });

  it.each([
    "begin;", "start transaction;", "commit;", "end;", "end work;", "rollback;", "abort;",
    "savepoint unreviewed;", "release savepoint unreviewed;", "prepare transaction 'unreviewed';", "set transaction read write;",
  ])("reserves transaction control for the runner: %s", (sql) => {
    expectCode(() => validateMigrationSource("0001_inventory.sql", `-- harmless\r\n${sql}`), "SQL_TRANSACTION");
  });

  it.each(["commit;", "rollback;", "savepoint s;", "release s;", "start transaction;", "prepare transaction 's';", "end transaction;", "end work;"])(
    "refuses actual transaction control in a function body: %s", (sql) => {
      expectCode(() => validateMigrationSource("0001_inventory.sql", plpgsqlFunction(sql)), "SQL_TRANSACTION");
    },
  );

  it.each([
    "select exists (select 1 from arbitrary.example);", "select exists (select 1 from public.example);",
    "select exists (select 1 from auth.users);", "select exists (select 1 from storage.objects);",
    "select exists (select 1 from e.example);", "select exists (select 1 from example);",
    "select arbitrary.check_value(p_value);", "select e.check_value(p_value);", "select unknown_call(p_value);",
    "select query_to_xml('delete from public.example', true, true, '');", "select pg_read_file('unreviewed');",
    "select auth.uid_extra();", "select shagun_private.unreviewed();", "select 'literal'::arbitrary.kind;",
    "select 'literal'::e.value;", "select 'literal' collate e.value;",
    "select exists (select 1 from shagun.cities c, e.example);",
    "select exists (select 1 from shagun.cities c join shagun.venues v on v.city_id = c.id, e.example);",
    "select exists (select 1 from shagun_private.schema_migrations);", "select true into unreviewed;",
    "select E'escaped';", "select U&'escaped';", "select $$nested dollar string$$;",
  ])("refuses cross-schema/unreviewed expressions in an otherwise reviewed function: %s", (body) => {
    expectCode(() => validateMigrationSource("0001_inventory.sql", sqlFunction(body)), "SQL_REVIEW");
  });

  it.each([
    "delete from arbitrary.example;", "update e.example set name = 'other';", "insert into auth.users (id) values (gen_random_uuid());",
    "delete from storage.objects;", "execute 'delete from public.example';", "set search_path = public;",
    "set local search_path = public;", "perform set_config('search_path', 'public', false);",
    "grant select on public.example to anon;", "analyze public.example;", "lock table public.example;",
    "do $nested$ begin perform 1; end; $nested$;",
  ])("refuses unreviewed function statements: %s", (body) => {
    expectCode(() => validateMigrationSource("0001_inventory.sql", plpgsqlFunction(body)), "SQL_REVIEW");
  });

  it("pins function names, language, privileges, arguments and search_path, not just CREATE FUNCTION", () => {
    const sql = inventoryFunction("shagun_private.valid_metadata");
    for (const [before, after] of [
      ["shagun_private.valid_metadata", "arbitrary.valid_metadata"], ["valid_metadata", "unreviewed"],
      ["language sql", "language plpython3u"], ["immutable set", "immutable security definer set"],
      ["p_value jsonb", "p_value text"], ["search_path = ''", "search_path = 'public'"],
      ["create function", "create or replace function"],
    ]) expectCode(() => validateMigrationSource("0001_inventory.sql", replaceOnce(sql, before, after)), "SQL_REVIEW");
    expectCode(() => validateMigrationSource("0001_inventory.sql", replaceOnce(inventoryFunction("shagun_private.facilities_changing"),
      "parent shagun.venues", "parent e.value")), "SQL_REVIEW");
  });

  it("does not turn the one Auth FK exception into managed reads, writes or arbitrary references", () => {
    for (const sql of [
      "create table shagun.cities (id uuid references auth.users(id));",
      "create table shagun.admin_users (id uuid references auth.users(other_id));",
      "create table shagun.cities (id uuid references arbitrary.example(id));",
      "create table shagun.cities (id uuid default arbitrary.new_id());",
      "create table shagun.cities (id e.value);",
      "create table shagun.cities (id uuid) inherits (public.example);",
    ]) expectCode(() => validateMigrationSource("0001_inventory.sql", sql), "SQL_REVIEW");
  });

  it("pins policy predicates, facility values, Storage neutrality and bucket settings", () => {
    const inventory = source("0001_inventory.sql");
    expectCode(() => validateMigrationSource("0001_inventory.sql", replaceOnce(inventory,
      "using (status = 'active')", "using (true)")), "SQL_REVIEW");
    expectCode(() => validateMigrationSource("0001_inventory.sql", replaceOnce(inventory,
      "'Air conditioning'", "'Unreviewed facility'")), "SQL_REVIEW");
    const storage = source("0002_storage.sql");
    for (const [before, after] of [
      ["'shagun-media'", "'other-media'"], ["false, 3145728", "true, 3145728"],
      ["3145728", "9999999"], ["'image/webp'", "'image/svg+xml'"],
      ["as restrictive", "as permissive"], ["is distinct from 'shagun-media'", "= 'shagun-media'"],
      ["or not pg_catalog.has_table_privilege", "and not pg_catalog.has_table_privilege"],
      ["'SELECT'", "'SELECT,INSERT,DELETE'"], ["shagun_media_admin_read", "other_policy"],
      [".webp$'", ".webp $'"], ["'shagun-media'", "'shagun- ' || 'media'"],
    ]) expectCode(() => validateMigrationSource("0002_storage.sql", replaceOnce(storage, before, after)), "SQL_REVIEW");
    const statements = sqlStatements(storage);
    expectCode(() => validateMigrationSource("0002_storage.sql", statements.slice(1).map(({ text }) => `${text};`).join("\n")), "SQL_REVIEW");
    expectCode(() => validateMigrationSource("0002_storage.sql", `${storage}\ngrant select on storage.objects to anon;`), "SQL_REVIEW");
  });
});

describe("comment, literal and delimiter boundaries", () => {
  it("keeps semicolons/comment markers/quotes in a literal opaque", () => {
    const sql = "comment on table shagun.venue_research is 'text; -- /* $$ ''quoted'' commit';";
    const [statement] = validateMigrationSource("0001_inventory.sql", sql);
    expect(statement.text).toBe(sql.slice(0, -1));
    expect(statement.code).not.toContain("commit");
    expect(statement.bodies).toEqual([]);
  });

  it.each(["\n", "\r\n", "\r"])("ends comments at %j without hiding subsequent SQL", (newline) => {
    const sql = `create schema shagun; -- harmless${newline}drop table public.example;`;
    expect(sqlStatements(sql)).toHaveLength(2);
    expectCode(() => validateMigrationSource("0001_inventory.sql", sql), "SQL_REVIEW");
    expectCode(() => validateMigrationSource("0001_inventory.sql", plpgsqlFunction(`-- harmless${newline}commit;`)), "SQL_TRANSACTION");
    expectCode(() => validateSeed(`${seed}\n-- harmless${newline}delete from auth.users;`), "SEED_REVIEW");
  });

  it.each(["create schema shagun; /*", "select 'unclosed", 'select "unclosed', "do $$ unclosed", "do $one$ body $two$;"])(
    "fails closed on unterminated source: %s", (sql) => {
      expectCode(() => validateMigrationSource("0001_inventory.sql", sql), "SQL_REVIEW");
      expectCode(() => validateSeed(sql), "SEED_REVIEW");
    },
  );
});

describe("exact reviewed seed signature", () => {
  it("accepts only the checked-in conflict-safe draft Hazaribag insert with benign formatting", () => {
    expect(() => validateSeed(seed)).not.toThrow();
    for (const newline of ["\n", "\r\n"]) {
      const sql = seed.replace(/\r\n/g, "\n").replace("insert into", "insert /* benign */ into").replace(/\n/g, newline);
      expect(() => validateSeed(`-- benign${newline}${sql}${newline}/* trailing */`)).not.toThrow();
    }
  });

  it("preserves literal spaces, values, operators and conflict behavior", () => {
    for (const [before, after] of [
      ["'draft'", "'active'"], ["'Hazaribag'", "'Other city'"], ["'Jharkhand'", "'Bihar'"],
      ["information for", "information  for"], ["shagun.cities", "public.cities"],
      ["do nothing", "do update set status = 'draft'"], ["'Hazaribag'", "E'Hazaribag'"],
      ["'Hazaribag'", "'Hazari' || 'bag'"], ["'Hazaribag'", "'Hazari' | /* not || */ | 'bag'"],
    ]) expectCode(() => validateSeed(replaceOnce(seed, before, after)), "SEED_REVIEW");
    expectCode(() => validateSeed(`${seed}\n${seed}`), "SEED_REVIEW");
    expectCode(() => validateSeed(`${seed}\ncommit;`), "SEED_REVIEW");
  });
});

const REF = "aaaaaaaaaaaaaaaaaaaa";
const OTHER_REF = "bbbbbbbbbbbbbbbbbbbb";
const PASSWORD = "synthetic-only:p@ss/%";
const HOST = `db.${REF}.supabase.co`;
const POOLER = "aws-0-ap-south-1.pooler.supabase.com";
const options: CliOptions = { apply: false, seed: false, expectedProjectRef: REF };
const selectedFile: CliOptions = { ...options, sourceEnv: "never-open-this-test-path" };
function url(host = HOST, user = "postgres", port = "5432", query = "") {
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(PASSWORD)}@${host}:${port}/postgres${query}`;
}
function target(raw = url()) { return connectionTarget(options, { environmentUrl: raw }); }

describe("explicit, exact connection target without ambient credentials", () => {
  it("defaults to inspection and requires the exact expected project in both modes", () => {
    expect(parseArguments(["--expected-project-ref", REF])).toEqual({ ...options, sourceEnv: undefined });
    expect(parseArguments(["--source-env", "synthetic-path", "--expected-project-ref", REF, "--apply", "--seed"]))
      .toEqual({ ...options, apply: true, seed: true, sourceEnv: "synthetic-path" });
    for (const args of [[], ["--apply"], ["--expected-project-ref", REF.toUpperCase()], ["--expected-project-ref", REF.slice(1)]]) {
      expectCode(() => parseArguments(args), "EXPECTED_PROJECT_REF");
    }
    for (const flags of [["--seed"], ["--apply", "--apply"], ["--force"], ["--source-env"],
      ["--database-url", url()], ["--password", PASSWORD], ["--expected-project-ref", REF]]) {
      expectCode(() => parseArguments(["--expected-project-ref", REF, ...flags]), "ARGUMENTS");
    }
  });

  it.each([[HOST, "postgres", "direct"], [HOST, `postgres.${REF}`, "direct"], [POOLER, `postgres.${REF}`, "session-pooler"]] as const)(
    "accepts only the canonical %s endpoint with its exact login", (host, user, endpoint) => {
      expect(target(url(host, user))).toMatchObject({ host, user, port: 5432, database: "postgres", projectRef: REF, endpoint, password: PASSWORD });
    },
  );

  it("selects DIRECT_URL first, without merging or falling back after a bad selected URL", () => {
    const actual = connectionTarget(selectedFile, { sourceText: `DIRECT_URL='${url()}'\nDATABASE_URL='${url(`db.${OTHER_REF}.supabase.co`)}'`,
      get environmentUrl(): string { throw new Error("Ambient fallback must not be read."); } });
    expect(actual.credentialVariable).toBe("DIRECT_URL");
    expect(actual.projectRef).toBe(REF);
    expect(connectionTarget(selectedFile, { sourceText: `DIRECT_URL=\nDATABASE_URL='${url()}'` }).credentialVariable).toBe("DATABASE_URL");
    expectCode(() => connectionTarget(selectedFile, { sourceText: `DIRECT_URL=invalid\nDATABASE_URL='${url()}'` }), "DATABASE_URL_INVALID");
    expectCode(() => connectionTarget(selectedFile, { sourceText: "", environmentUrl: url() }), "DATABASE_URL_MISSING");
    expectCode(() => connectionTarget(selectedFile, { environmentUrl: url() }), "SOURCE_READ");
    expectCode(() => connectionTarget(options, { sourceText: `DATABASE_URL='${url()}'` }), "DATABASE_URL_MISSING");
    expectCode(() => connectionTarget(selectedFile, { sourceText: "DIRECT_URL=${DATABASE_URL}" }), "DATABASE_URL_INVALID");
    expect(connectionTarget(options, { environmentUrl: url(), get sourceText(): string { throw new Error("Unselected text must not be read."); } }).projectRef).toBe(REF);
  });

  it.each([
    [url(`${HOST}.example.test`), "DATABASE_ENDPOINT"], [url(`${HOST}.`), "DATABASE_ENDPOINT"],
    [url("localhost"), "DATABASE_ENDPOINT"], [url("127.0.0.1"), "DATABASE_ENDPOINT"],
    [url(REF + ".supabase.co"), "DATABASE_ENDPOINT"], [url(POOLER), "DATABASE_ENDPOINT"],
    [url(HOST, "service_role"), "DATABASE_ENDPOINT"], [url(HOST, `postgres.${REF}.extra`), "DATABASE_ENDPOINT"],
    [url(HOST, "postgres", "6543"), "TRANSACTION_POOLER"], [url(HOST, "postgres", "5433"), "DATABASE_ENDPOINT"],
    [url(`db.${OTHER_REF}.supabase.co`), "PROJECT_MISMATCH"], [url(HOST, `postgres.${OTHER_REF}`), "PROJECT_MISMATCH"],
    [url(POOLER, `postgres.${OTHER_REF}`), "PROJECT_MISMATCH"],
    [url().replace(/\/postgres$/, "/other"), "DATABASE_ENDPOINT"], [url().replace("postgresql:", "https:"), "DATABASE_URL_INVALID"],
    [url().replace(encodeURIComponent(PASSWORD), ""), "DATABASE_URL_INVALID"],
    [url().replace(encodeURIComponent(PASSWORD), "%XX"), "DATABASE_URL_INVALID"], [url() + "#fragment", "DATABASE_URL_INVALID"],
  ] as const)("refuses spoofed or unsupported synthetic target case %#", (raw, code) => {
    expectCode(() => target(raw), code);
  });

  it.each([
    "host=localhost", "hostaddr=127.0.0.1", "user=postgres", "password=other", "options=-csearch_path%3Dpublic",
    "sslmode=disable", "sslmode=prefer", "sslmode=allow", "ssl=false", "sslrootcert=untrusted-path", "servername=other",
    "schema=auth", "sslmode=require&sslmode=disable", "schema=public&schema=public", "connection_limit=-1", "unknown=value",
  ])("refuses connection overrides or weaker TLS: %s", (query) => {
    expectCode(() => target(url(HOST, "postgres", "5432", `?${query}`)), "DATABASE_URL_INVALID");
  });

  it.each([false, true])("constructs verified TLS and explicit bounded connection settings (apply=%s)", (apply) => {
    const parsed = target(url(HOST, "postgres", "5432", "?sslmode=require&sslrootcert=system&schema=public&pgbouncer=true&connection_limit=1&pool_timeout=10&connect_timeout=15"));
    const configured = connectionOptions(parsed, apply);
    expect(configured.ssl).toEqual({ rejectUnauthorized: true, servername: HOST, minVersion: "TLSv1.2" });
    expect(configured.ssl).not.toHaveProperty("ca");
    expect(configured).toMatchObject({ host: HOST, port: 5432, database: "postgres", max: 1, prepare: false, debug: false,
      backoff: false, fetch_types: true, target_session_attrs: "primary", connection: {
        default_transaction_read_only: !apply, search_path: "pg_catalog", standard_conforming_strings: "on",
        statement_timeout: 20_000, lock_timeout: 2_000, idle_in_transaction_session_timeout: 20_000,
      } });
    expect(configured).not.toHaveProperty("schema");
    expect(configured).not.toHaveProperty("pgbouncer");
  });

  it("redacts usernames, passwords, URLs and raw error fields from reports", () => {
    const parsed = target(url(POOLER, `postgres.${REF}`));
    const summary = safeTarget(parsed);
    expect(summary).toEqual({ projectRef: REF, host: POOLER, port: 5432, endpoint: "session-pooler", credentialVariable: "SHAGUN_DATABASE_URL" });
    expect(summary).not.toHaveProperty("user");
    expect(summary).not.toHaveProperty("password");
    const raw = { code: "42501", get message() { throw new Error("Must not inspect raw messages."); },
      get detail() { throw new Error("Must not inspect details."); }, get cause() { throw new Error("Must not inspect causes."); } };
    const failure = sanitizedFailure(raw);
    expect(failure.code).toBe("42501");
    expect(sanitizedFailure({ code: `${PASSWORD}\n`, message: url() }).code).toBe("REDACTED_ERROR");
    expect(sanitizedFailure(url()).code).toBe("REDACTED_ERROR");
    expect(sanitizedFailure({ code: "SELF_SIGNED_CERT_IN_CHAIN", message: url() }).message).toContain("TLS verification must remain enabled");
    expect(sanitizedFailure(new SafeError("SQL_REVIEW"))).toMatchObject({ code: "SQL_REVIEW" });
    for (const secret of [PASSWORD, encodeURIComponent(PASSWORD), parsed.user, url()]) {
      expect(JSON.stringify({ summary, failure })).not.toContain(secret);
    }
  });
});

const migrations: Migration[] = MIGRATION_FILES.map((filename) => ({ filename, version: filename.slice(0, 4), checksum: sha256(filename), statements: [] }));
const ledger: LedgerRow[] = migrations.map(({ version, checksum }) => ({ version, checksum }));
const installed: NamespaceState = { shagun: true, private: true, ledger: true };
const fresh: NamespaceState = { shagun: false, private: false, ledger: false };

describe("namespace, ledger and preservation fail-closed behavior", () => {
  it("plans a first install without adopting an existing namespace", () => {
    expect(migrationPlan(migrations, fresh, [])).toEqual({ firstInstall: true, applied: [], pending: migrations });
    expectCode(() => migrationPlan(migrations, { shagun: true, private: true, ledger: false }, []), "LEDGER_REQUIRED");
  });

  it.each([
    { shagun: true, private: false, ledger: false }, { shagun: false, private: true, ledger: false },
    { shagun: true, private: false, ledger: true }, { shagun: false, private: true, ledger: true },
    { shagun: false, private: false, ledger: true },
  ])("refuses inconsistent namespace state %j", (state) => {
    expectCode(() => migrationPlan(migrations, state, []), "NAMESPACE_STATE");
  });

  it.each([1, 2, 3, 4])("accepts exactly an ordered checksum-matching prefix of length %s", (length) => {
    expect(migrationPlan(migrations, installed, ledger.slice(0, length)))
      .toEqual({ firstInstall: false, applied: migrations.slice(0, length), pending: migrations.slice(length) });
  });

  it("rejects empty, gapped, duplicate, reordered, unknown or unrecorded ledgers", () => {
    for (const rows of [[], ledger.slice(1), [ledger[0], ledger[2]], [ledger[0], ledger[0]], [...ledger].reverse(),
      [{ ...ledger[0], version: "9999" }], [...ledger, ledger[0]]]) {
      expectCode(() => migrationPlan(migrations, installed, rows), "LEDGER_PREFIX");
    }
    expectCode(() => migrationPlan(migrations, fresh, ledger), "LEDGER_PREFIX");
    for (const checksum of ["", "not-a-hash", "A".repeat(64), "0".repeat(64)]) {
      expectCode(() => migrationPlan(migrations, installed, [{ ...ledger[0], checksum }]), "LEDGER_CHECKSUM");
    }
  });

  it("refuses Storage collisions/adoption and changed recorded installations", () => {
    expect(() => assertStorageState(false, false, false, [])).not.toThrow();
    expectCode(() => assertStorageState(false, true, true, []), "BUCKET_COLLISION");
    expectCode(() => assertStorageState(false, false, false, [STORAGE_POLICIES[0]]), "POLICY_COLLISION");
    expect(() => assertStorageState(true, true, true, [...STORAGE_POLICIES].reverse())).not.toThrow();
    expectCode(() => assertStorageState(true, false, false, STORAGE_POLICIES), "STORAGE_STATE");
    expectCode(() => assertStorageState(true, true, false, STORAGE_POLICIES), "STORAGE_STATE");
    for (const names of [STORAGE_POLICIES.slice(1), [...STORAGE_POLICIES, "unexpected"], [...STORAGE_POLICIES, STORAGE_POLICIES[0]]]) {
      expectCode(() => assertStorageState(true, true, true, names), "STORAGE_STATE");
    }
    expect(exposedSchemas('public, shagun, "shagun_private"')).toEqual({ known: true, public: true, shagun: true, private: true });
    expect(exposedSchemas(null).known).toBe(false);
  });

  it("rejects changed shared metadata, buckets, fingerprints or managed counts", () => {
    const before: PreservationSnapshot = { metadata: { public: "public-before", auth: "auth-before", storage: "storage-before" }, buckets: "[]",
      shared: Object.fromEntries(SHARED_TABLES.map((name) => [name, { count: "1", digest: "synthetic-row-fingerprint" }])), authUsers: "2", storageObjects: "3" };
    expect(Object.values(assertPreserved(before, structuredClone(before))).every(Boolean)).toBe(true);
    for (const change of [
      (after: PreservationSnapshot) => { after.metadata.public = "changed"; },
      (after: PreservationSnapshot) => { after.metadata.auth = "changed"; },
      (after: PreservationSnapshot) => { after.metadata.storage = "changed"; },
      (after: PreservationSnapshot) => { after.buckets = "changed"; },
      (after: PreservationSnapshot) => { after.shared.Order = { count: "1", digest: "changed" }; },
      (after: PreservationSnapshot) => { after.shared.Product = { count: "2", digest: "synthetic-row-fingerprint" }; },
      (after: PreservationSnapshot) => { after.authUsers = "4"; },
      (after: PreservationSnapshot) => { after.storageObjects = "4"; },
    ]) {
      const after = structuredClone(before);
      change(after);
      expectCode(() => assertPreserved(before, after), "SNAPSHOT_CHANGED");
    }
  });
});

describe("planner import and explicit file I/O boundaries", () => {
  function isolatedPlanner() {
    const forbidden = vi.fn(() => { throw new Error("Ambient environment, logging, network and module-load I/O are forbidden."); });
    const filesystem = { readFile: vi.fn(), readdir: vi.fn() };
    filesystem.readFile.mockImplementation(forbidden);
    filesystem.readdir.mockImplementation(forbidden);
    const imports = new Map<string, unknown>([
      ["node:crypto", { createHash }], ["node:path", { resolve }], ["node:fs/promises", filesystem],
      ["dotenv", { parse, config: forbidden, configDotenv: forbidden }],
    ]);
    const exports = {};
    const code = transpileModule(plannerSource, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText;
    runInNewContext(code, {
      exports, URL, process: new Proxy({}, { get: forbidden, set: forbidden }),
      console: new Proxy({}, { get: forbidden }), fetch: forbidden,
      require: (name: string) => { if (!imports.has(name)) return forbidden(); return imports.get(name); },
    }, { timeout: 2000 });
    expect(forbidden).not.toHaveBeenCalled();
    return { planner: exports as typeof import("../../scripts/db-migration-plan"), filesystem, forbidden };
  }

  it("imports and parses explicit synthetic credentials without reading process.env/argv, files or logging", () => {
    const { planner, filesystem, forbidden } = isolatedPlanner();
    const args = planner.parseArguments(["--expected-project-ref", REF, "--source-env", "never-open-this-test-path"]);
    const parsed = planner.connectionTarget(args, { sourceText: `DIRECT_URL='${url()}'` });
    expect(planner.safeTarget(parsed).projectRef).toBe(REF);
    expect(planner.connectionOptions(parsed, false).ssl.rejectUnauthorized).toBe(true);
    expect(forbidden).not.toHaveBeenCalled();
    expect(filesystem.readFile).not.toHaveBeenCalled();
    expect(filesystem.readdir).not.toHaveBeenCalled();
  });

  it("reads only the exact four SQL paths on explicit request", async () => {
    const { planner, filesystem, forbidden } = isolatedPlanner();
    filesystem.readdir.mockResolvedValue(sources.map(({ filename }) => ({ name: filename, isFile: () => true })));
    filesystem.readFile.mockImplementation(async (path: string) => {
      const entry = sources.find(({ filename }) => path === resolve(directory, filename));
      if (!entry) return forbidden();
      return entry.sql;
    });
    const result = await planner.readMigrationSources(directory);
    expect(result.map(({ filename }) => filename)).toEqual(MIGRATION_FILES);
    expect(filesystem.readdir).toHaveBeenCalledExactlyOnceWith(directory, { withFileTypes: true });
    expect(filesystem.readFile.mock.calls).toEqual(MIGRATION_FILES.map((filename) => [resolve(directory, filename), "utf8"]));
    expect(forbidden).not.toHaveBeenCalled();
  });

  it("refuses unknown/non-file SQL entries before opening any file and redacts read failures", async () => {
    const { planner, filesystem } = isolatedPlanner();
    for (const entries of [
      [{ name: "other.sql", isFile: () => true }],
      MIGRATION_FILES.map((name, index) => ({ name, isFile: () => index !== 0 })),
    ]) {
      filesystem.readdir.mockResolvedValue(entries);
      await expect(planner.readMigrationSources(directory)).rejects.toMatchObject({ code: "SQL_FILES" });
      expect(filesystem.readFile).not.toHaveBeenCalled();
    }
    filesystem.readdir.mockRejectedValue(new Error(`synthetic private detail: ${url()}`));
    await expect(planner.readMigrationSources(directory)).rejects.toMatchObject({ code: "SQL_READ" });
  });
});