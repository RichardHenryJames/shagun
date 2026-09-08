import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "dotenv";

// No process.env, argv, dotenv.config, database client, or module-load I/O here.
// Credential tests pass synthetic strings; filesystem reads require an explicit
// directory. SQL checks are a deliberately narrow review gate, not a SQL sandbox.
export const MIGRATION_FILES = [
  "0001_inventory.sql", "0002_storage.sql", "0003_sitemap.sql", "0004_media_uploads.sql",
] as const;
export type MigrationFile = typeof MIGRATION_FILES[number];
export const SHARED_TABLES = ["Category", "Product", "Order", "ContactMessage"] as const;
export const SHAGUN_TABLES = [
  "admin_users", "analytics_daily", "cities", "facilities", "media_assets", "rate_limits",
  "storage_cleanup_jobs", "venue_facilities", "venue_research", "venues",
] as const;
export type ShagunTable = typeof SHAGUN_TABLES[number];
export const APP_ROLES = ["anon", "authenticated", "service_role"] as const;
export type AppRole = typeof APP_ROLES[number];
export const STORAGE_POLICIES = [
  "shagun_media_admin_delete", "shagun_media_admin_insert", "shagun_media_admin_read",
  "shagun_media_anon_guard", "shagun_media_auth_guard", "shagun_media_no_overwrite",
] as const;

const SAFE_MESSAGES = {
  ARGUMENTS: "Use only --source-env PATH, --expected-project-ref REF, --apply and --seed. Duplicate flags and credential arguments are refused. --seed requires --apply.",
  EXPECTED_PROJECT_REF: "Supply --expected-project-ref with the exact 20-character lowercase Supabase project reference in both modes.",
  SOURCE_READ: "The explicitly selected environment file could not be read. No alternate file or environment credentials were tried.",
  DATABASE_URL_MISSING: "Supply an explicit --source-env file containing DIRECT_URL (preferred) or DATABASE_URL, or set only SHAGUN_DATABASE_URL in the process environment.",
  DATABASE_URL_INVALID: "The selected PostgreSQL URL is invalid or contains unsupported options. Credentials and the URL are redacted.",
  DATABASE_ENDPOINT: "Only canonical Supabase direct DNS or Supabase AWS session-pooler DNS on port 5432, database postgres, and the postgres migration login are accepted. Aliases are refused.",
  TRANSACTION_POOLER: "Port 6543 is a transaction pooler and is refused. Select the project's direct or session-pooler endpoint on port 5432; do not merely rewrite a URL's port.",
  PROJECT_MISMATCH: "The hostname/login project reference does not match --expected-project-ref. No connection was attempted.",
  TLS_CONFIGURATION: "TLS verification must remain enabled. Configure trusted Node/system CA certificates in the launching process; no insecure fallback is provided.",
  SQL_FILES: "Exactly the four checked-in migration SQL filenames are required. Missing, duplicate, renamed or extra SQL migrations need a reviewed runner update.",
  SQL_READ: "The checked-in migration or seed sources could not be read. No database connection was attempted.",
  SQL_TRANSACTION: "Migration SQL contains transaction control. Only the runner may begin, commit or roll back the operation.",
  SQL_REVIEW: "SQL is outside the reviewed Shagun-only statement surface. Review the source and runner together; there is no force or skip-validation flag.",
  SEED_REVIEW: "The seed must be exactly the reviewed conflict-safe draft Hazaribag insert, with no overwrite or other records.",
  NAMESPACE_STATE: "Shagun namespaces are partially present or inconsistent. Automatic adoption, repair and reset are refused.",
  LEDGER_REQUIRED: "Existing Shagun namespaces require their private migration ledger. Legacy tables cannot be adopted automatically.",
  LEDGER_INVALID: "The private ledger structure, ownership, privileges or rows are invalid. No automatic repair or adoption is permitted.",
  LEDGER_PREFIX: "Ledger versions must be a nonempty, exact ordered prefix of the four known migrations, with no gaps, duplicates or unknown versions.",
  LEDGER_CHECKSUM: "A recorded migration checksum differs from the checked-in SQL bytes. Do not edit history or overwrite the ledger to force migration.",
  SHARED_TABLES: "Shared-source mode requires all four real public Bihari tables: Category, Product, Order and ContactMessage, readable without RLS filtering.",
  MANAGED_DEPENDENCIES: "PostgreSQL 15+, the managed Auth/Storage relations and application roles, and readable count/metadata surfaces are required.",
  MIGRATION_PRIVILEGES: "Required migration-owner permissions are missing. This runner never widens managed schema, Auth, Storage or shared-table privileges.",
  STORAGE_RLS: "Managed storage.objects must already have RLS enabled. This runner will not alter managed Storage RLS.",
  STORAGE_PERMISSIONS: "Managed Storage must already give authenticated schema USAGE and each of SELECT, INSERT and DELETE on storage.objects.",
  BUCKET_COLLISION: "The shagun-media bucket already exists before its recorded migration. It will not be adopted, updated or replaced.",
  POLICY_COLLISION: "A reserved Shagun Storage policy already exists before its recorded migration. It will not be adopted or replaced.",
  STORAGE_STATE: "The recorded Storage installation must retain the private WebP bucket and exactly its six expected policy names.",
  ADVISORY_LOCK: "Another Shagun schema migration holds the advisory lock. Stop and re-inspect later; no waiting loop or automatic retry is used.",
  PRIVATE_EXPOSED: "The allowlisted Data API schema setting includes shagun_private. Have an operator review the existing API list; this runner will not change it.",
  POSTCONDITIONS: "Shagun tables, RPC signatures, RLS, ownership or grants do not match the reviewed installation. The transaction must not commit.",
  SNAPSHOT_CHANGED: "An existing public/Auth/Storage metadata, bucket, count or shared-data fingerprint changed inside the operation. The transaction must not commit.",
} as const;

export type SafeErrorCode = keyof typeof SAFE_MESSAGES;
export class SafeError extends Error {
  constructor(public readonly code: SafeErrorCode) {
    super(SAFE_MESSAGES[code]);
    this.name = "SafeError";
  }
}

const DATABASE_HINTS: Readonly<Record<string, string>> = {
  "42501": "A required permission is missing. Review migration-owner and managed Storage permissions without widening shared grants.",
  "55000": "A managed-service preflight or object-state prerequisite failed. No automatic repair is attempted.",
  "57014": "The 20-second statement budget was exceeded or the statement was cancelled. Do not force or sample a preservation check; arrange a reviewed maintenance approach.",
  "55P03": "The 2-second lock budget was exceeded. Re-inspect later; no shared tables are explicitly locked and no retry is automatic.",
  "40001": "Concurrent database changes prevented a safe transaction. Re-inspect before explicitly retrying.",
  "23505": "A uniqueness collision occurred. Existing buckets and migration history are never overwritten.",
  "42P06": "A namespace collision occurred. Legacy schemas are never adopted automatically.",
  "42P07": "An object collision occurred. Existing objects are never replaced automatically.",
  SELF_SIGNED_CERT_IN_CHAIN: SAFE_MESSAGES.TLS_CONFIGURATION,
  DEPTH_ZERO_SELF_SIGNED_CERT: SAFE_MESSAGES.TLS_CONFIGURATION,
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: SAFE_MESSAGES.TLS_CONFIGURATION,
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: SAFE_MESSAGES.TLS_CONFIGURATION,
  CERT_HAS_EXPIRED: SAFE_MESSAGES.TLS_CONFIGURATION,
  ERR_TLS_CERT_ALTNAME_INVALID: SAFE_MESSAGES.TLS_CONFIGURATION,
};

export function sanitizedFailure(error: unknown): { code: string; message: string } {
  if (error instanceof SafeError) return { code: error.code, message: SAFE_MESSAGES[error.code] };
  // Never inspect message, detail, hint, query, parameters, stack or nested causes.
  const candidate = error !== null && typeof error === "object" && "code" in error ? error.code : undefined;
  const code = typeof candidate === "string" && /^[A-Z0-9_]{1,64}$/.test(candidate) ? candidate : "REDACTED_ERROR";
  return { code, message: DATABASE_HINTS[code] ?? "The operation failed. Database, filesystem and network details are redacted. No automatic retry is performed." };
}

export interface CliOptions {
  apply: boolean;
  seed: boolean;
  sourceEnv?: string;
  expectedProjectRef: string;
}

export function parseArguments(args: readonly string[]): CliOptions {
  let apply = false;
  let seed = false;
  let sourceEnv: string | undefined;
  let expectedProjectRef: string | undefined;
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (seen.has(flag)) throw new SafeError("ARGUMENTS");
    seen.add(flag);
    if (flag === "--apply") apply = true;
    else if (flag === "--seed") seed = true;
    else if (flag === "--source-env" || flag === "--expected-project-ref") {
      const value = args[++index];
      if (!value || value.startsWith("--") || /[\r\n\0]/.test(value)) throw new SafeError("ARGUMENTS");
      if (flag === "--source-env") sourceEnv = value;
      else expectedProjectRef = value;
    } else throw new SafeError("ARGUMENTS");
  }
  if (!expectedProjectRef || !/^[a-z0-9]{20}$/.test(expectedProjectRef)) throw new SafeError("EXPECTED_PROJECT_REF");
  if (seed && !apply) throw new SafeError("ARGUMENTS");
  return { apply, seed, sourceEnv, expectedProjectRef };
}

export interface ConnectionTarget {
  host: string;
  port: 5432;
  database: "postgres";
  user: string;
  password: string;
  projectRef: string;
  endpoint: "direct" | "session-pooler";
  credentialVariable: "DIRECT_URL" | "DATABASE_URL" | "SHAGUN_DATABASE_URL";
}

export function connectionTarget(
  options: CliOptions,
  input: { sourceText?: string; environmentUrl?: string },
): ConnectionTarget {
  if (!/^[a-z0-9]{20}$/.test(options.expectedProjectRef)) throw new SafeError("EXPECTED_PROJECT_REF");
  let raw: string | undefined;
  let credentialVariable: ConnectionTarget["credentialVariable"] = "SHAGUN_DATABASE_URL";
  if (options.sourceEnv !== undefined) {
    if (input.sourceText === undefined) throw new SafeError("SOURCE_READ");
    // parse(), not config(): no interpolation, process mutation, sibling probing,
    // logging, key inspection or merging with ambient DATABASE_URL/DIRECT_URL.
    const selected = parse(input.sourceText);
    credentialVariable = selected.DIRECT_URL?.trim() ? "DIRECT_URL" : "DATABASE_URL";
    raw = selected[credentialVariable];
  } else raw = input.environmentUrl;
  if (!raw?.trim()) throw new SafeError("DATABASE_URL_MISSING");

  let url: URL;
  let user: string;
  let password: string;
  try {
    raw = raw.trim();
    if (/[\s\0]/.test(raw) || /\$\{/.test(raw)) throw new SafeError("DATABASE_URL_INVALID");
    url = new URL(raw);
    user = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
  } catch {
    throw new SafeError("DATABASE_URL_INVALID");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || url.hash || !password || /[\r\n\0]/.test(password)) {
    throw new SafeError("DATABASE_URL_INVALID");
  }
  if (url.port === "6543") throw new SafeError("TRANSACTION_POOLER");
  const host = url.hostname.toLowerCase();
  const direct = /^db\.([a-z0-9]{20})\.supabase\.co$/.exec(host);
  const pooler = /^aws-[0-9]+-[a-z0-9]+(?:-[a-z0-9]+)+\.pooler\.supabase\.com$/.test(host);
  const login = /^postgres\.([a-z0-9]{20})$/.exec(user);
  if ((!direct && !pooler) || (url.port && url.port !== "5432") || url.pathname !== "/postgres"
      || (!login && !(direct && user === "postgres"))) throw new SafeError("DATABASE_ENDPOINT");
  const projectRef = direct?.[1] ?? login?.[1];
  if (!projectRef || projectRef !== options.expectedProjectRef || (login && login[1] !== projectRef)) {
    throw new SafeError("PROJECT_MISMATCH");
  }

  // Never pass URL query parameters to postgres.js: it can promote them to
  // startup settings, host overrides or weaker TLS. Accept only known harmless
  // Prisma annotations / verified TLS requests, then construct explicit options.
  const seen = new Set<string>();
  for (const [key, value] of url.searchParams) {
    if (seen.has(key)) throw new SafeError("DATABASE_URL_INVALID");
    seen.add(key);
    const allowed = (key === "sslmode" && ["require", "verify-ca", "verify-full"].includes(value))
      || (key === "sslrootcert" && value === "system")
      || (key === "schema" && value === "public")
      || (key === "pgbouncer" && ["true", "false"].includes(value))
      || (["connection_limit", "pool_timeout", "connect_timeout"].includes(key) && /^[0-9]{1,3}$/.test(value));
    if (!allowed) throw new SafeError("DATABASE_URL_INVALID");
  }
  return { host, port: 5432, database: "postgres", user, password, projectRef,
    endpoint: direct ? "direct" : "session-pooler", credentialVariable };
}

export function safeTarget(target: ConnectionTarget) {
  // Explicit projection: spreading ConnectionTarget would disclose credentials.
  return { projectRef: target.projectRef, host: target.host, port: target.port,
    endpoint: target.endpoint, credentialVariable: target.credentialVariable };
}

export function connectionOptions(target: ConnectionTarget, apply: boolean) {
  return {
    host: target.host, port: target.port, database: target.database, user: target.user, password: target.password,
    ssl: { rejectUnauthorized: true, servername: target.host, minVersion: "TLSv1.2" },
    // Omitting ca retains Node's configured trust roots, including system CA
    // support when the operator enabled it before starting Node. No fallback.
    max: 1, connect_timeout: 15, idle_timeout: 5, prepare: false,
    // "read-write" would reject our deliberately read-only inspection session.
    // "primary" rejects replicas without requiring a writable transaction.
    // Required by postgres.js for tx.array(..., 25): it must resolve text's
    // array OID/serializer from pg_type rather than send a comma-joined scalar.
    // This reads only type OIDs, under the same statement/TLS limits.
    fetch_types: true, debug: false, backoff: false, target_session_attrs: "primary" as const,
    onnotice: () => undefined, onparameter: () => undefined,
    connection: {
      application_name: "shagun-db-migrate", statement_timeout: 20_000, lock_timeout: 2_000,
      idle_in_transaction_session_timeout: 20_000, default_transaction_read_only: !apply,
      search_path: "pg_catalog", TimeZone: "UTC", DateStyle: "ISO, YMD",
      IntervalStyle: "postgres", extra_float_digits: 3, bytea_output: "hex", standard_conforming_strings: "on",
    },
  };
}

export function sha256(text: string): string {
  // Exact UTF-8 source, including line endings. An altered checkout must not
  // silently acquire the checksum of a previously applied migration.
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export interface SqlStatement { text: string; code: string; bodies: string[] }

type SqlToken = { start: number; end: number } & (
  | { kind: "word" | "number" | "symbol" | "literal" | "identifier"; value: string }
  | { kind: "body"; value: string; source: string }
);

// A lexer for the reviewed source dialect, NOT a general PostgreSQL parser.
// In particular, escaped/Unicode/bit strings, quoted names, psql commands and
// unknown operators are not alternative spellings of reviewed SQL. Ordinary
// strings rely on the runner's standard_conforming_strings=on setting.
function sqlTokens(source: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  for (let index = 0; index < source.length;) {
    const start = index;
    if (/[ \t\r\n\f]/.test(source[index])) {
      index++;
    } else if (source.startsWith("--", index)) {
      // PostgreSQL ends a line comment at CR OR LF, not just LF.
      index += 2;
      while (index < source.length && !/[\r\n]/.test(source[index])) index++;
    } else if (source.startsWith("/*", index)) {
      let depth = 1;
      index += 2;
      while (depth && index < source.length) {
        if (source.startsWith("/*", index)) { depth++; index += 2; }
        else if (source.startsWith("*/", index)) { depth--; index += 2; }
        else index++;
      }
      if (depth) throw new SafeError("SQL_REVIEW");
    } else if (source[index] === "'" || source[index] === '"') {
      const quote = source[index++];
      let closed = false;
      while (index < source.length) {
        if (source[index++] !== quote) continue;
        if (source[index] === quote) { index++; continue; }
        closed = true; break;
      }
      if (!closed) throw new SafeError("SQL_REVIEW");
      tokens.push({ kind: quote === "'" ? "literal" : "identifier", value: source.slice(start, index), start, end: index });
    } else if (source[index] === "$") {
      const tag = /^\$(?:[a-z_][a-z0-9_]*)?\$/i.exec(source.slice(index))?.[0];
      if (!tag) throw new SafeError("SQL_REVIEW");
      const bodyStart = index + tag.length;
      const end = source.indexOf(tag, bodyStart);
      if (end === -1) throw new SafeError("SQL_REVIEW");
      index = end + tag.length;
      tokens.push({ kind: "body", value: tag, source: source.slice(bodyStart, end), start, end: index });
    } else {
      if (/^(?:[ebxn]'|u&['"])/i.test(source.slice(index))) throw new SafeError("SQL_REVIEW");
      const word = /^[a-z_][a-z0-9_$]*/i.exec(source.slice(index))?.[0];
      const number = /^[0-9]+/.exec(source.slice(index))?.[0];
      // Keep multi-character operators whole: | /* comment */ | is NOT ||,
      // nor are - > > and ->>. Never join tokens across a comment boundary.
      const symbol = /^(?:#>>|->>|::|:=|<>|!=|<=|>=|!~|@@|\|\||->|=>|[(),;.\[\]+*/=<>~?%-])/.exec(source.slice(index))?.[0];
      const value = word ?? number ?? symbol;
      if (!value) throw new SafeError("SQL_REVIEW");
      index += value.length;
      tokens.push({ kind: word ? "word" : number ? "number" : "symbol", value, start, end: index });
    }
  }
  return tokens;
}

const tokenValue = (token: SqlToken) => token.kind === "word" ? token.value.toLowerCase() : token.value;
const tokenCode = (token: SqlToken) => token.kind === "literal" ? "'literal'"
  : token.kind === "identifier" ? '"identifier"' : token.kind === "body" ? "$body$" : tokenValue(token);

export function sqlStatements(source: string): SqlStatement[] {
  const statements: SqlStatement[] = [];
  let pending: SqlToken[] = [];
  const finish = () => {
    if (pending.length) statements.push({
      text: source.slice(pending[0].start, pending[pending.length - 1].end),
      code: pending.map(tokenCode).join(" "),
      bodies: pending.flatMap((token) => token.kind === "body" ? [token.source] : []),
    });
    pending = [];
  };
  for (const token of sqlTokens(source)) {
    if (token.kind === "symbol" && token.value === ";") finish();
    else pending.push(token);
  }
  finish();
  return statements;
}

const reviewSignature = (sql: string): string => JSON.stringify(sqlTokens(sql).map((token) =>
  // Dollar delimiters are containers, not SQL tokens in their body. Lex the
  // body too, so its comments/CRLF are ignored but literals/operators are exact.
  token.kind === "body" ? ["body", reviewSignature(token.source)] : [token.kind, tokenValue(token)]));
const bodyCode = (sql: string): string => sqlStatements(sql)
  .map((statement) => `${statement.code} ${statement.bodies.map(bodyCode).join(" ")}`).join(" ");

// Pin names, signatures, languages, security mode and empty search paths, not
// merely a CREATE FUNCTION prefix. New objects/dialects require runner review.
const FUNCTION_REVIEW: Readonly<Record<MigrationFile, readonly string[]>> = {
  "0001_inventory.sql": [
    "shagun_private.valid_metadata(p_value jsonb) returns boolean language sql immutable",
    "shagun.is_admin() returns boolean language sql stable security definer",
    "shagun_private.require_admin() returns void language plpgsql stable security invoker",
    ...["enforce_city", "enforce_venue", "enforce_research", "research_changed", "facilities_changing", "media_changing", "media_changed"]
      .map((name) => `shagun_private.${name}() returns trigger language plpgsql security definer`),
    "shagun_private.check_page(p_query text, p_page integer, p_limit integer) returns void language plpgsql immutable security invoker",
    "shagun_private.prefix_query(p_query text) returns tsquery language sql immutable security invoker",
    "shagun_private.needs_review(p_venue shagun.venues) returns boolean language sql stable security invoker",
    "shagun.venue_document(p_id uuid) returns jsonb language sql stable security invoker",
    "shagun_private.city_summary(p_city shagun.cities, p_public boolean) returns jsonb language sql stable security invoker",
    "shagun.public_cities(p_query text default '', p_page integer default 1, p_limit integer default 24) returns jsonb language plpgsql stable security invoker",
    "shagun.search_venues(p_city uuid default null, p_query text default '', p_capacity integer default null, p_budget numeric default null, p_price_type text default null, p_facilities text[] default '{}', p_type text default null, p_sort text default 'recent', p_page integer default 1, p_limit integer default 12) returns jsonb language plpgsql stable security invoker",
    "shagun.city_facets(p_city uuid) returns jsonb language sql stable security invoker",
    "shagun.admin_city_summaries(p_query text default '', p_page integer default 1, p_limit integer default 25) returns jsonb language plpgsql stable security invoker",
    "shagun.admin_venues(p_city uuid default null, p_query text default '', p_status text default '', p_page integer default 1) returns jsonb language plpgsql stable security invoker",
    "shagun.admin_dashboard() returns jsonb language plpgsql stable security invoker",
    "shagun_private.iso_timestamp(p_value text) returns timestamptz language plpgsql stable security invoker",
    "shagun.save_city(p_data jsonb, p_id uuid default null, p_expected timestamptz default null) returns uuid language plpgsql security invoker",
    "shagun.save_venue(p_data jsonb, p_id uuid default null, p_expected timestamptz default null) returns uuid language plpgsql security invoker",
    "shagun.delete_record(p_kind text, p_id uuid, p_name text, p_expected timestamptz) returns void language plpgsql security invoker",
    "shagun.update_photo(p_id uuid, p_operation text, p_alt text default '', p_credit text default '') returns void language plpgsql security invoker",
    "shagun.consume_rate_limit(p_key text, p_limit integer, p_seconds integer) returns boolean language plpgsql security definer",
    "shagun.record_event(p_event text, p_city uuid, p_venue uuid default null) returns void language plpgsql security definer",
  ],
  "0002_storage.sql": [],
  "0003_sitemap.sql": [
    "shagun.sitemap_entries(p_offset integer default 0, p_limit integer default 1000) returns jsonb language plpgsql stable security invoker",
  ],
  "0004_media_uploads.sql": [
    "shagun.begin_media_upload(p_key text) returns void language plpgsql security definer",
    "shagun.finalize_media_upload(p_data jsonb) returns jsonb language plpgsql security invoker",
  ],
};
const OWN_FUNCTIONS = new Set(Object.values(FUNCTION_REVIEW).flat().map((header) => header.slice(0, header.indexOf("("))));

// ACLs, policies, indexes, triggers and the sole inventory insert have no
// open-ended expression tail. Compare their COMPLETE reviewed token sequences.
const STATIC_REVIEW: Readonly<Record<Exclude<MigrationFile, "0002_storage.sql">, string>> = {
  "0001_inventory.sql": `
    create schema shagun;
    create schema shagun_private;
    create index cities_status_name_idx on shagun.cities (status, name, id);
    create index cities_search_idx on shagun.cities using gin (to_tsvector('pg_catalog.simple'::regconfig, name || ' ' || state));
    create index venues_search_idx on shagun.venues using gin (search_document);
    create index venues_city_status_updated_idx on shagun.venues (city_id, status, updated_at desc, id);
    create index venues_status_updated_idx on shagun.venues (status, updated_at desc, id);
    create index venues_updated_idx on shagun.venues (updated_at desc, id);
    create index venues_capacity_idx on shagun.venues (city_id, capacity_max, id) where status = 'published';
    create index venues_price_idx on shagun.venues (city_id, price_type, (coalesce(price_min, price_max)), id) where status = 'published';
    insert into shagun.facilities (code, label, sort_order) values
      ('ac', 'Air conditioning', 0), ('parking', 'Parking', 1), ('rooms', 'Guest rooms', 2),
      ('catering', 'Catering', 3), ('decoration', 'Decoration', 4), ('kitchen', 'Kitchen', 5),
      ('power_backup', 'Power backup', 6), ('lift', 'Lift', 7), ('accessible_entry', 'Accessible entry', 8);
    create index venue_facilities_code_idx on shagun.venue_facilities (facility_code, venue_id);
    create unique index media_venue_cover_idx on shagun.media_assets (venue_id) where is_cover and venue_id is not null;
    create unique index media_city_cover_idx on shagun.media_assets (city_id) where is_cover and city_id is not null;
    create index media_venue_order_idx on shagun.media_assets (venue_id, sort_order, id);
    create index media_city_order_idx on shagun.media_assets (city_id, sort_order, id);
    create index storage_cleanup_created_idx on shagun.storage_cleanup_jobs (created_at, id);
    create index rate_limits_expiry_idx on shagun.rate_limits (resets_at, key);
    create index analytics_city_day_idx on shagun.analytics_daily (city_id, day desc);
    create trigger cities_invariants before insert or update or delete on shagun.cities for each row execute function shagun_private.enforce_city();
    create trigger venues_invariants before insert or update or delete on shagun.venues for each row execute function shagun_private.enforce_venue();
    create trigger research_invariants before insert or update on shagun.venue_research for each row execute function shagun_private.enforce_research();
    create trigger research_parent_changed after insert or update or delete on shagun.venue_research for each row execute function shagun_private.research_changed();
    create trigger facilities_parent_changing before insert or update or delete on shagun.venue_facilities for each row execute function shagun_private.facilities_changing();
    create trigger media_parent_lock before insert or update or delete on shagun.media_assets for each row execute function shagun_private.media_changing();
    create trigger media_parent_changed after insert or update or delete on shagun.media_assets for each row execute function shagun_private.media_changed();
    revoke all on table shagun.cities, shagun.venues, shagun.facilities, shagun.venue_facilities,
      shagun.venue_research, shagun.media_assets, shagun.admin_users, shagun.storage_cleanup_jobs,
      shagun.rate_limits, shagun.analytics_daily from public, anon, authenticated, service_role;
    grant select on shagun.cities, shagun.venues, shagun.facilities, shagun.venue_facilities, shagun.media_assets to anon, authenticated;
    grant insert, update, delete on shagun.cities, shagun.venues, shagun.venue_facilities, shagun.media_assets to authenticated;
    grant select, insert, update, delete on shagun.venue_research to authenticated;
    grant select on shagun.admin_users, shagun.analytics_daily to authenticated;
    grant select, delete on shagun.storage_cleanup_jobs to authenticated;
    grant all on shagun.cities, shagun.venues, shagun.facilities, shagun.venue_facilities, shagun.venue_research,
      shagun.media_assets, shagun.admin_users, shagun.storage_cleanup_jobs, shagun.rate_limits, shagun.analytics_daily to service_role;
    ${SHAGUN_TABLES.map((name) => `alter table shagun.${name} enable row level security;`).join("\n")}
    create policy cities_public_read on shagun.cities for select to anon, authenticated using (status = 'active');
    create policy cities_admin on shagun.cities for all to authenticated using ((select shagun.is_admin())) with check ((select shagun.is_admin()));
    create policy venues_public_read on shagun.venues for select to anon, authenticated using (
      status = 'published' and exists (select 1 from shagun.cities c where c.id = city_id and c.status = 'active'));
    create policy venues_admin on shagun.venues for all to authenticated using ((select shagun.is_admin())) with check ((select shagun.is_admin()));
    create policy venue_facilities_public_read on shagun.venue_facilities for select to anon, authenticated using (
      exists (select 1 from shagun.venues v join shagun.cities c on c.id = v.city_id where v.id = venue_id and v.status = 'published' and c.status = 'active'));
    create policy venue_facilities_admin on shagun.venue_facilities for all to authenticated using ((select shagun.is_admin())) with check ((select shagun.is_admin()));
    create policy facilities_public_read on shagun.facilities for select to anon, authenticated using (
      exists (select 1 from shagun.venue_facilities vf where vf.facility_code = code));
    create policy facilities_admin_read on shagun.facilities for select to authenticated using ((select shagun.is_admin()));
    create policy media_public_read on shagun.media_assets for select to anon, authenticated using (
      (venue_id is not null and exists (select 1 from shagun.venues v join shagun.cities c on c.id = v.city_id
        where v.id = venue_id and v.status = 'published' and c.status = 'active'))
      or (city_id is not null and exists (select 1 from shagun.cities c where c.id = city_id and c.status = 'active')));
    create policy media_admin on shagun.media_assets for all to authenticated using ((select shagun.is_admin())) with check ((select shagun.is_admin()));
    create policy research_admin on shagun.venue_research for all to authenticated using ((select shagun.is_admin())) with check ((select shagun.is_admin()));
    create policy admin_self_read on shagun.admin_users for select to authenticated using (id = (select auth.uid()));
    create policy cleanup_admin_read on shagun.storage_cleanup_jobs for select to authenticated using ((select shagun.is_admin()));
    create policy cleanup_admin_delete on shagun.storage_cleanup_jobs for delete to authenticated using ((select shagun.is_admin()));
    create policy analytics_admin_read on shagun.analytics_daily for select to authenticated using ((select shagun.is_admin()));
    revoke all on all functions in schema shagun_private from public, anon, authenticated, service_role;
    revoke all on function shagun.is_admin(), shagun.venue_document(uuid), shagun.public_cities(text, integer, integer),
      shagun.search_venues(uuid, text, integer, numeric, text, text[], text, text, integer, integer), shagun.city_facets(uuid),
      shagun.admin_city_summaries(text, integer, integer), shagun.admin_venues(uuid, text, text, integer), shagun.admin_dashboard(),
      shagun.save_city(jsonb, uuid, timestamptz), shagun.save_venue(jsonb, uuid, timestamptz),
      shagun.delete_record(text, uuid, text, timestamptz), shagun.update_photo(uuid, text, text, text),
      shagun.consume_rate_limit(text, integer, integer), shagun.record_event(text, uuid, uuid)
      from public, anon, authenticated, service_role;
    grant execute on function shagun_private.valid_metadata(jsonb), shagun_private.check_page(text, integer, integer),
      shagun_private.prefix_query(text), shagun_private.needs_review(shagun.venues), shagun_private.city_summary(shagun.cities, boolean)
      to anon, authenticated, service_role;
    grant execute on function shagun_private.require_admin(), shagun_private.iso_timestamp(text), shagun.is_admin() to authenticated, service_role;
    grant execute on function shagun.venue_document(uuid), shagun.public_cities(text, integer, integer),
      shagun.search_venues(uuid, text, integer, numeric, text, text[], text, text, integer, integer), shagun.city_facets(uuid)
      to anon, authenticated, service_role;
    grant execute on function shagun.admin_city_summaries(text, integer, integer), shagun.admin_venues(uuid, text, text, integer),
      shagun.admin_dashboard(), shagun.save_city(jsonb, uuid, timestamptz), shagun.save_venue(jsonb, uuid, timestamptz),
      shagun.delete_record(text, uuid, text, timestamptz), shagun.update_photo(uuid, text, text, text) to authenticated;
    grant execute on function shagun.consume_rate_limit(text, integer, integer), shagun.record_event(text, uuid, uuid) to service_role;
  `,
  "0003_sitemap.sql": `
    revoke all on function shagun.sitemap_entries(integer, integer) from public, anon, authenticated;
    grant execute on function shagun.sitemap_entries(integer, integer) to anon, authenticated, service_role;
  `,
  "0004_media_uploads.sql": `
    alter table shagun.storage_cleanup_jobs add column ready_at timestamptz not null default transaction_timestamp();
    create index storage_cleanup_ready_idx on shagun.storage_cleanup_jobs (ready_at, id);
    grant update (id) on shagun.storage_cleanup_jobs to authenticated;
    create policy cleanup_admin_lock on shagun.storage_cleanup_jobs for update to authenticated using ((select shagun.is_admin())) with check (false);
    revoke all on function shagun.begin_media_upload(text), shagun.finalize_media_upload(jsonb) from public, anon, authenticated, service_role;
    grant execute on function shagun.begin_media_upload(text), shagun.finalize_media_upload(jsonb) to authenticated;
  `,
};
const STATIC_SIGNATURES = new Map(Object.entries(STATIC_REVIEW).map(([filename, sql]) =>
  [filename, new Set(sqlStatements(sql).map((statement) => reviewSignature(statement.text)))]));

type ReviewedStatement =
  | { kind: "static" }
  | { kind: "table"; table: ShagunTable; tokens: SqlToken[] }
  | { kind: "function"; language: "sql" | "plpgsql"; tokens: SqlToken[] };

function reviewedSchemaAcl(values: readonly string[]): boolean {
  const grant = values.slice(0, 4).join(" ") === "grant usage on schema";
  if (!grant && values.slice(0, 4).join(" ") !== "revoke all on schema") return false;
  const split = values.indexOf(grant ? "to" : "from", 4);
  if (split < 0) return false;
  const list = (items: readonly string[], allowed: readonly string[]) => items.length % 2 === 1
    && items.every((item, index) => index % 2 ? item === "," : allowed.includes(item))
    && new Set(items.filter((_, index) => index % 2 === 0)).size === (items.length + 1) / 2;
  // Whole names, not a regex prefix: private alone and combined schemas work,
  // but no third schema, CREATE, PUBLIC usage, grant option or unknown role does.
  return list(values.slice(4, split), ["shagun", "shagun_private"])
    && list(values.slice(split + 1), grant ? APP_ROLES : ["public", ...APP_ROLES]);
}

function reviewedStatement(filename: MigrationFile, statement: SqlStatement): ReviewedStatement {
  if (STATIC_SIGNATURES.get(filename)?.has(reviewSignature(statement.text))) return { kind: "static" };
  const tokens = sqlTokens(statement.text);
  const values = tokens.map(tokenValue);
  if (filename === "0001_inventory.sql" && reviewedSchemaAcl(values)) return { kind: "static" };
  const body = tokens[tokens.length - 1];
  if (body?.kind === "body") {
    const header = reviewSignature(statement.text.slice(0, body.start));
    const reviewed = FUNCTION_REVIEW[filename].find((candidate) =>
      reviewSignature(`create function ${candidate} set search_path = '' as`) === header);
    if (reviewed) return { kind: "function", language: reviewed.includes(" language sql ") ? "sql" : "plpgsql", tokens: sqlTokens(body.source) };
  }
  if (filename === "0001_inventory.sql" && values.slice(0, 4).join(" ") === "create table shagun ."
    && SHAGUN_TABLES.includes(values[4] as ShagunTable) && values[5] === "(") {
    let depth = 0;
    const closed = tokens.findIndex((token, index) => {
      if (index < 5 || token.kind !== "symbol") return false;
      if (token.value === "(") depth++;
      return token.value === ")" && --depth === 0;
    });
    if (closed === tokens.length - 1) return { kind: "table", table: values[4] as ShagunTable, tokens: tokens.slice(6, -1) };
  }
  const comment = /^comment on (table|column) shagun \. ([a-z_]+)(?: \. ([a-z_]+))? is 'literal'$/.exec(statement.code);
  if (comment && ((filename === "0001_inventory.sql" && (
    (comment[1] === "table" && ["venue_research", "storage_cleanup_jobs"].includes(comment[2]) && !comment[3])
    || (comment[1] === "column" && ["cities.metadata", "cities.updated_at", "venues.updated_at"].includes(`${comment[2]}.${comment[3]}`))))
    || (filename === "0004_media_uploads.sql" && comment[2] === "storage_cleanup_jobs"
      && ((comment[1] === "table" && !comment[3]) || (comment[1] === "column" && comment[3] === "ready_at"))))) return { kind: "static" };
  throw new SafeError("SQL_REVIEW");
}

const CATALOG_CALLS = new Set([
  "array_agg", "btrim", "cardinality", "char_length", "clock_timestamp", "coalesce", "count", "gen_random_uuid", "greatest", "isfinite",
  "jsonb_agg", "jsonb_array_elements", "jsonb_array_elements_text", "jsonb_array_length", "jsonb_build_object", "jsonb_each", "jsonb_typeof",
  "least", "lower", "make_interval", "max", "nullif", "octet_length", "pg_trigger_depth", "quote_literal", "row", "row_number", "setweight",
  "string_agg", "to_jsonb", "to_tsquery", "to_tsvector", "transaction_timestamp", "tsvector_to_array", "unnest",
]);
const EXPRESSION_GROUPS = new Set(["and", "any", "as", "check", "conflict", "else", "exists", "filter", "from", "if", "in", "key", "materialized", "not", "offset", "or", "over", "return", "select", "then", "unique", "values", "when", "where"]);
const ROW_ALIASES = new Set(["a", "aggregate", "bucket", "c", "e", "excluded", "f", "m", "new", "old", "p", "p_city", "p_venue", "parent", "photo", "previous", "r", "requested", "reservation", "t", "v", "vf"]);
const LOCAL_RELATIONS = new Set(["matching", "ordered", "page_rows", "visible", "routes", "page", "positions"]);
const INTO_VARIABLES = new Set(["adjacent_id", "allowed", "facility_list", "parent", "photo", "photo_count", "previous", "record_name", "replacement", "reservation", "result", "review_time"]);
const VARIABLE_TYPES = new Set(["boolean", "date", "integer", "jsonb", "text", "timestamptz", "tsquery", "uuid"]);
const RELATION_CLAUSE_ENDS = new Set(["where", "group", "order", "limit", "offset", "having", "returning", "union", "except", "intersect", "for", "set"]);

// These are static-scope checks over a closed dialect, not a proof of arbitrary
// function semantics. Expressions/PLpgSQL still require source review and DB
// postconditions. No dynamic SQL, new callable, new schema or managed write is
// accepted just because the enclosing function/table belongs to Shagun.
function assertOwnCode(model: Exclude<ReviewedStatement, { kind: "static" }>): void {
  const { tokens } = model;
  const values = tokens.map(tokenValue);
  const at = (index: number) => values[index];
  const ownTable = (index: number) => at(index) === "shagun" && at(index + 1) === "." && SHAGUN_TABLES.includes(at(index + 2) as ShagunTable);
  if (tokens.some((token) => token.kind === "body" || token.kind === "identifier")) throw new SafeError("SQL_REVIEW");
  if (model.kind === "function") {
    if (model.language === "sql" ? !["select", "with"].includes(at(0))
      : !["begin", "declare"].includes(at(0)) || values.slice(-2).join(" ") !== "end ;") throw new SafeError("SQL_REVIEW");
    if (/\b(?:alter|analyze|comment|create|discard|grant|import|lock|merge|refresh|revoke|execute|table|into\s+strict)\b/.test(tokens.map(tokenCode).join(" "))) throw new SafeError("SQL_REVIEW");
    // A field alias is not permission to use an external schema as a type.
    // Only the actual leading PLpgSQL declarations (including text[]) exist in
    // this dialect; no nested DECLARE blocks, custom types or %ROWTYPE escapes.
    if (tokens.some((token, index) => index > 0 && token.kind === "word" && tokenValue(token) === "declare")) throw new SafeError("SQL_REVIEW");
    if (at(0) === "declare") {
      let index = 1;
      while (at(index) !== "begin") {
        if (tokens[index]?.kind !== "word") throw new SafeError("SQL_REVIEW");
        index++;
        if (ownTable(index)) index += 3;
        else if (VARIABLE_TYPES.has(at(index))) index++;
        else throw new SafeError("SQL_REVIEW");
        if (at(index) === "[" && at(index + 1) === "]") index += 2;
        if (at(index) === ":=") {
          index++;
          while (index < tokens.length && !(tokens[index].kind === "symbol" && at(index) === ";")) index++;
        }
        if (at(index++) !== ";") throw new SafeError("SQL_REVIEW");
      }
    }
  }
  let depth = 0;
  const relationLists = new Set<number>();
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.kind === "symbol") {
      if (token.value === "(") depth++;
      else if (token.value === ")") { relationLists.delete(depth); depth--; }
      else if (token.value === ";") relationLists.delete(depth);
      // The reviewed queries use explicit JOINs, never comma joins. Otherwise
      // a known field alias could be misread as a schema in a later FROM item.
      else if (token.value === "," && relationLists.has(depth)) throw new SafeError("SQL_REVIEW");
    }
    if (token.kind !== "word") continue;
    const value = at(index);
    if (RELATION_CLAUSE_ENDS.has(value)) relationLists.delete(depth);
    if ((["e", "b", "x", "n", "u"].includes(value) && tokens[index + 1]?.kind === "literal")
      || (value === "do" && !["update", "nothing"].includes(at(index + 1)))) throw new SafeError("SQL_REVIEW");
    // UPDATE ... SET and ON CONFLICT ... DO UPDATE SET are expressions in the
    // reviewed functions; standalone SET must never change session settings.
    if (value === "set" && !((at(index - 4) === "update" && ownTable(index - 3))
      || (at(index - 5) === "update" && ownTable(index - 4) && ROW_ALIASES.has(at(index - 1)))
      || (at(index - 2) === "do" && at(index - 1) === "update"))) throw new SafeError("SQL_REVIEW");
    if (at(index + 1) === ".") {
      const name = `${value}.${at(index + 2)}`;
      const authReference = model.kind === "table" && model.table === "admin_users" && at(index - 1) === "references"
        && name === "auth.users" && values.slice(index + 3, index + 6).join(" ") === "( id )";
      const field = model.kind === "function" && ROW_ALIASES.has(value) && !["::", "collate"].includes(at(index - 1));
      if (at(index + 3) === "." || !(ownTable(index) || OWN_FUNCTIONS.has(name) || authReference
        || (name === "auth.uid" && values.slice(index + 3, index + 5).join(" ") === "( )") || field)) throw new SafeError("SQL_REVIEW");
    }
    if (at(index + 1) === "(") {
      const qualified = at(index - 1) === ".";
      const name = qualified ? `${at(index - 2)}.${value}` : value;
      const aliasDeclaration = !qualified && (at(index - 1) === ")" || at(index - 1) === "as")
        && ["terms", "f", "requested", "bucket", "aggregate"].includes(value);
      if (qualified ? !(OWN_FUNCTIONS.has(name) || ownTable(index - 2) || name === "auth.uid"
          || (model.kind === "table" && model.table === "admin_users" && name === "auth.users" && at(index - 3) === "references"))
        : !(CATALOG_CALLS.has(value) || EXPRESSION_GROUPS.has(value) || aliasDeclaration)) throw new SafeError("SQL_REVIEW");
    }
    const reference = value === "references";
    const write = (value === "into" && at(index - 1) === "insert") || (value === "from" && at(index - 1) === "delete")
      || (value === "update" && at(index - 1) !== "for" && !(at(index - 1) === "do" && at(index + 1) === "set"));
    const read = value === "join" || (value === "from" && !["distinct", "delete"].includes(at(index - 1)));
    if (read) relationLists.add(depth);
    if (reference || write || read) {
      const next = index + 1;
      const authReference = reference && model.kind === "table" && model.table === "admin_users"
        && values.slice(next, next + 6).join(" ") === "auth . users ( id )";
      const localRead = read && (at(next) === "(" || (LOCAL_RELATIONS.has(at(next)) && at(next + 1) !== ".")
        || (CATALOG_CALLS.has(at(next)) && at(next + 1) === "("));
      if (!ownTable(next) && !authReference && !localRead) throw new SafeError("SQL_REVIEW");
    }
    if (value === "into" && at(index - 1) !== "insert"
      && !(model.kind === "function" && model.language === "plpgsql" && INTO_VARIABLES.has(at(index + 1)) && at(index + 2) !== ".")) throw new SafeError("SQL_REVIEW");
  }
}

// Storage is the ONLY top-level write outside Shagun. Pin the small reviewed
// surface semantically (comments/formatting ignored), including neutral guards.
const STORAGE_REVIEW = String.raw`
do $shagun_storage_preflight$
begin
  if not exists (select 1 from pg_catalog.pg_class
    where oid = pg_catalog.to_regclass('storage.objects') and relkind in ('r', 'p')) then
    raise exception using errcode = '55000', message = 'shagun_requires_managed_storage_objects';
  end if;
  if not exists (select 1 from pg_catalog.pg_class
    where oid = pg_catalog.to_regclass('storage.objects') and relrowsecurity) then
    raise exception using errcode = '55000', message = 'shagun_requires_storage_rls';
  end if;
  if not pg_catalog.has_schema_privilege('authenticated', 'storage', 'USAGE')
     or not pg_catalog.has_table_privilege('authenticated', 'storage.objects', 'SELECT')
     or not pg_catalog.has_table_privilege('authenticated', 'storage.objects', 'INSERT')
     or not pg_catalog.has_table_privilege('authenticated', 'storage.objects', 'DELETE') then
    raise exception using errcode = '42501', message = 'shagun_requires_storage_authenticated_privileges';
  end if;
end;
$shagun_storage_preflight$;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shagun-media', 'shagun-media', false, 3145728, array['image/webp']);
create policy shagun_media_anon_guard on storage.objects as restrictive for all to anon
  using (bucket_id is distinct from 'shagun-media') with check (bucket_id is distinct from 'shagun-media');
create policy shagun_media_auth_guard on storage.objects as restrictive for all to authenticated
  using (bucket_id is distinct from 'shagun-media' or (select shagun.is_admin()))
  with check (bucket_id is distinct from 'shagun-media' or ((select shagun.is_admin())
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/(480|960|1600)\.webp$'));
create policy shagun_media_no_overwrite on storage.objects as restrictive for update to authenticated
  using (bucket_id is distinct from 'shagun-media') with check (bucket_id is distinct from 'shagun-media');
create policy shagun_media_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'shagun-media' and (select shagun.is_admin()));
create policy shagun_media_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'shagun-media' and (select shagun.is_admin())
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/(480|960|1600)\.webp$');
create policy shagun_media_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'shagun-media' and (select shagun.is_admin()));
`;
const SEED_REVIEW = `insert into shagun.cities (name, slug, state, country, description, status)
values ('Hazaribag', 'hazaribag', 'Jharkhand', 'India',
  'Wedding venue information for Hazaribag. Listings are added after editorial research.', 'draft')
on conflict (slug) do nothing`;

export function validateSeed(sql: string): void {
  try {
    const statements = sqlStatements(sql);
    if (statements.length !== 1 || reviewSignature(statements[0].text) !== reviewSignature(SEED_REVIEW)) throw new SafeError("SEED_REVIEW");
  } catch {
    throw new SafeError("SEED_REVIEW");
  }
}

export function validateMigrationSource(filename: MigrationFile, sql: string): SqlStatement[] {
  if (!MIGRATION_FILES.includes(filename)) throw new SafeError("SQL_FILES");
  const statements = sqlStatements(sql);
  if (!statements.length) throw new SafeError("SQL_REVIEW");
  for (const statement of statements) {
    const top = statement.code;
    if (/^(?:begin|start\s+transaction|commit|end|rollback|abort|savepoint|release|prepare\s+transaction|set\s+transaction)\b/.test(top)) {
      throw new SafeError("SQL_TRANSACTION");
    }
    const bodies = statement.bodies.map(bodyCode).join(" ");
    const all = `${top} ${bodies}`;
    // BEGIN/END inside a function are PLpgSQL blocks (or CASE expressions),
    // not runner transactions. Transaction-only commands are still refused.
    if (/\b(?:commit|rollback|savepoint|abort|release)\b|\b(?:start|prepare|set|end)\s+transaction\b|\bend\s+work\b/.test(bodies)) throw new SafeError("SQL_TRANSACTION");
    if (/\b(?:drop|truncate|copy|vacuum|reindex|cluster|reassign|reset|notify|listen|unlisten|load|call)\b/.test(all)
      || /\b(?:alter|create)\s+(?:system|role|user|database|extension|event\s+trigger|publication|subscription|server|tablespace|foreign)\b/.test(all)
      || /\balter\s+default\s+privileges\b|\bdisable\s+(?:row\s+level\s+security|trigger)\b/.test(all)
      || /\bset\s+(?:session|role|transaction|session_replication_role)\b/.test(all)
      || /\b(?:set_config|pg_notify|dblink[a-z_]*|pg_[a-z_]*file[a-z_]*|lo_[a-z_]+)\s*\(/.test(all)
      || /\bexecute\b/.test(bodies) || /"identifier"/.test(all)
      || /\bpublic\s*\.|\bauth\s*\.\s*(?!uid\b|users\b)[a-z_]/.test(all)
      || /\b(?:insert\s+into|update|delete\s+from|alter\s+table)\s+(?:auth|storage|pg_catalog)\s*\./.test(bodies)
      || /\b(?:from|join)\s+auth\s*\.\s*users\b/.test(all)) throw new SafeError("SQL_REVIEW");

    if (filename === "0002_storage.sql") continue; // Whole reviewed source compared below.
    const model = reviewedStatement(filename, statement);
    if (model.kind !== "static") assertOwnCode(model);
  }
  if (filename === "0002_storage.sql") {
    const expected = sqlStatements(STORAGE_REVIEW).map((statement) => reviewSignature(statement.text));
    if (JSON.stringify(statements.map((statement) => reviewSignature(statement.text))) !== JSON.stringify(expected)) throw new SafeError("SQL_REVIEW");
  }
  return statements;
}

export interface Migration {
  filename: MigrationFile;
  version: string;
  checksum: string;
  statements: readonly SqlStatement[];
}

export function buildMigrations(sources: readonly { filename: string; sql: string }[]): Migration[] {
  const ordered = [...sources].sort((a, b) => a.filename < b.filename ? -1 : a.filename > b.filename ? 1 : 0);
  if (ordered.length !== MIGRATION_FILES.length || ordered.some((source, index) => source.filename !== MIGRATION_FILES[index])) {
    throw new SafeError("SQL_FILES");
  }
  return ordered.map((source, index) => ({ filename: MIGRATION_FILES[index], version: source.filename.slice(0, 4),
    checksum: sha256(source.sql), statements: validateMigrationSource(MIGRATION_FILES[index], source.sql) }));
}

export async function readMigrationSources(migrationsDirectory: string): Promise<Migration[]> {
  try {
    const entries = await readdir(migrationsDirectory, { withFileTypes: true });
    const names = entries.filter((entry) => /\.sql$/i.test(entry.name)).map((entry) => entry.name);
    if (names.length !== MIGRATION_FILES.length || entries.some((entry) => names.includes(entry.name) && !entry.isFile())) {
      throw new SafeError("SQL_FILES");
    }
    // No arbitrary filenames are ever opened, even if directory contents change.
    if (names.sort().some((name, index) => name !== MIGRATION_FILES[index])) throw new SafeError("SQL_FILES");
    return buildMigrations(await Promise.all(names.map(async (filename) => ({ filename, sql: await readFile(resolve(migrationsDirectory, filename), "utf8") }))));
  } catch (error) {
    if (error instanceof SafeError) throw error;
    throw new SafeError("SQL_READ");
  }
}

export interface LedgerRow { version: string; checksum: string }
export interface NamespaceState { shagun: boolean; private: boolean; ledger: boolean }

export function migrationPlan(migrations: readonly Migration[], state: NamespaceState, ledger: readonly LedgerRow[]) {
  if (state.shagun !== state.private || (!state.private && state.ledger)) throw new SafeError("NAMESPACE_STATE");
  if (state.shagun && !state.ledger) throw new SafeError("LEDGER_REQUIRED");
  if ((!state.ledger && ledger.length) || (state.ledger && !ledger.length) || ledger.length > migrations.length) throw new SafeError("LEDGER_PREFIX");
  for (const [index, row] of ledger.entries()) {
    if (row.version !== migrations[index]?.version) throw new SafeError("LEDGER_PREFIX");
    if (!/^[a-f0-9]{64}$/.test(row.checksum) || row.checksum !== migrations[index].checksum) throw new SafeError("LEDGER_CHECKSUM");
  }
  return { firstInstall: !state.shagun, applied: migrations.slice(0, ledger.length), pending: migrations.slice(ledger.length) };
}

export function assertStorageState(storageApplied: boolean, bucketPresent: boolean, bucketValid: boolean, policyNames: readonly string[]) {
  const actual = [...policyNames].sort();
  if (!storageApplied) {
    if (bucketPresent) throw new SafeError("BUCKET_COLLISION");
    if (actual.length) throw new SafeError("POLICY_COLLISION");
  } else if (!bucketPresent || !bucketValid || JSON.stringify(actual) !== JSON.stringify(STORAGE_POLICIES)) {
    throw new SafeError("STORAGE_STATE");
  }
}

export function exposedSchemas(setting: string | null) {
  if (!setting?.trim()) return { known: false, public: false, shagun: false, private: false };
  const names = setting.split(",").map((name) => name.trim().replace(/^"([a-z_][a-z0-9_]*)"$/, "$1"));
  return { known: names.every((name) => /^[a-z_][a-z0-9_]*$/.test(name)),
    public: names.includes("public"), shagun: names.includes("shagun"), private: names.includes("shagun_private") };
}

export interface Fingerprint { count: string; digest: string }
export interface PreservationSnapshot {
  metadata: { public: string; auth: string; storage: string };
  buckets: string;
  shared: Partial<Record<typeof SHARED_TABLES[number], Fingerprint>>;
  authUsers: string;
  storageObjects: string;
}

export function assertPreserved(before: PreservationSnapshot, after: PreservationSnapshot) {
  const checks = {
    publicMetadataUnchanged: before.metadata.public === after.metadata.public,
    authMetadataUnchanged: before.metadata.auth === after.metadata.auth,
    storageMetadataUnchanged: before.metadata.storage === after.metadata.storage,
    storageBucketsUnchanged: before.buckets === after.buckets,
    sharedDataUnchanged: SHARED_TABLES.every((table) => before.shared[table]?.count === after.shared[table]?.count
      && before.shared[table]?.digest === after.shared[table]?.digest),
    authCountUnchanged: before.authUsers === after.authUsers,
    storageObjectCountUnchanged: before.storageObjects === after.storageObjects,
  };
  if (Object.values(checks).some((unchanged) => !unchanged)) throw new SafeError("SNAPSHOT_CHANGED");
  return checks;
}

const PUBLIC_READ = ["cities", "venues", "facilities", "venue_facilities", "media_assets"];
export const TABLE_PRIVILEGES = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"] as const;
export function tablePrivileges(table: ShagunTable, role: AppRole): readonly string[] {
  if (role === "service_role") return TABLE_PRIVILEGES;
  if (role === "anon") return PUBLIC_READ.includes(table) ? ["SELECT"] : [];
  if (["cities", "venues", "venue_facilities", "media_assets", "venue_research"].includes(table)) return ["SELECT", "INSERT", "UPDATE", "DELETE"];
  if (["facilities", "admin_users", "analytics_daily"].includes(table)) return ["SELECT"];
  return table === "storage_cleanup_jobs" ? ["SELECT", "DELETE"] : [];
}

export const RPC_CONTRACTS: readonly { name: string; args: string; roles: readonly AppRole[]; definer: boolean }[] = [
  { name: "is_admin", args: "", roles: ["authenticated", "service_role"], definer: true },
  { name: "venue_document", args: "uuid", roles: APP_ROLES, definer: false },
  { name: "public_cities", args: "text, integer, integer", roles: APP_ROLES, definer: false },
  { name: "search_venues", args: "uuid, text, integer, numeric, text, text[], text, text, integer, integer", roles: APP_ROLES, definer: false },
  { name: "city_facets", args: "uuid", roles: APP_ROLES, definer: false },
  { name: "admin_city_summaries", args: "text, integer, integer", roles: ["authenticated"], definer: false },
  { name: "admin_venues", args: "uuid, text, text, integer", roles: ["authenticated"], definer: false },
  { name: "admin_dashboard", args: "", roles: ["authenticated"], definer: false },
  { name: "save_city", args: "jsonb, uuid, timestamp with time zone", roles: ["authenticated"], definer: false },
  { name: "save_venue", args: "jsonb, uuid, timestamp with time zone", roles: ["authenticated"], definer: false },
  { name: "delete_record", args: "text, uuid, text, timestamp with time zone", roles: ["authenticated"], definer: false },
  { name: "update_photo", args: "uuid, text, text, text", roles: ["authenticated"], definer: false },
  { name: "consume_rate_limit", args: "text, integer, integer", roles: ["service_role"], definer: true },
  { name: "record_event", args: "text, uuid, uuid", roles: ["service_role"], definer: true },
  { name: "sitemap_entries", args: "integer, integer", roles: APP_ROLES, definer: false },
  { name: "begin_media_upload", args: "text", roles: ["authenticated"], definer: true },
  { name: "finalize_media_upload", args: "jsonb", roles: ["authenticated"], definer: false },
];
export const PRIVATE_FUNCTION_GRANTS: Readonly<Record<string, readonly AppRole[]>> = {
  valid_metadata: APP_ROLES, check_page: APP_ROLES, prefix_query: APP_ROLES, needs_review: APP_ROLES, city_summary: APP_ROLES,
  require_admin: ["authenticated", "service_role"], iso_timestamp: ["authenticated", "service_role"],
  enforce_city: [], enforce_venue: [], enforce_research: [], research_changed: [], facilities_changing: [], media_changing: [], media_changed: [],
};

export const OPERATOR_PLAN = [
  "Inspection is read-only, not deployment approval, a backup, or real-service certification. Arrange a verified shared-project backup/recovery plan first.",
  "For the intended shared project, run npx tsx scripts/db-migrate.ts --source-env ../biharibhojan/.env --expected-project-ref ixkhyqqovacdramymqjk. The path is resolved from the launching directory; SQL is resolved from this script's project root.",
  "Only after reviewing a successful inspection, repeat the same explicit target with --apply; append --seed only when the draft Hazaribag city is wanted. There is no force, reset, adoption, automatic retry or build hook.",
  "Apply uses one REPEATABLE READ transaction: advisory lock, preflight/snapshots, pending reviewed SQL, private checksum ledger, optional draft-only seed, postconditions and preservation checks, then commit.",
  "Shared row fingerprints use count plus aggregated MD5 limbs entirely in SQL with a 20-second statement budget. They are regression fingerprints, not cryptographic authenticity proofs; no sampling or unbounded row-array accumulation is used.",
  "No explicit Bihari row/table locks are taken. Ordinary SELECT AccessShare locks permit DML but can delay conflicting ALTER TABLE until the bounded operation ends; absolute zero DDL locking is impossible with these transaction snapshots.",
  "Repeatable-read comparisons see this operation's changes, not later committed orders. They do not certify other concurrent transactions or independently lock out external schema administrators.",
  "Storage preservation excludes only the newly inserted shagun-media bucket and its six new policies. The two internal Auth FK support triggers belong to the new shagun.admin_users constraint, not an altered managed Auth definition.",
  "Data API exposure detection reads only the pgrst.db_schemas setting allowlist and may be unknown or overridden outside SQL. Verify it in the managed dashboard separately.",
  "An operator must append shagun to the EXISTING exposed API schema list, retaining public and every other existing entry, and keep shagun_private OFF. This runner does not edit Data API settings, shared permissions, Auth settings or accounts.",
  "Publishable and service API keys cannot be derived from a database URL. Obtain them separately through the project's approved dashboard/secret workflow; never paste keys, database URLs, usernames or passwords into chat or logs.",
  "Shared Auth policy changes and administrator provisioning require separate explicit operator review. Do not disable or reconfigure Bihari Auth as a side effect of Shagun setup.",
  "A lost connection at commit can leave the outcome unknown. Re-run read-only inspection and inspect the private ledger before any explicit retry; never infer rollback from a network error alone.",
] as const;