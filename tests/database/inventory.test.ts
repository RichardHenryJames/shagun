import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { City, CitySummary, DashboardData, Facets, Photo, PublicVenue, SearchResult, VenueResearch } from "../../src/lib/types";

// All venues, additional cities, users, addresses and provenance in this file are
// SYNTHETIC. They are created only in an isolated, in-memory PostgreSQL instance.
const ADMIN = "10000000-0000-4000-8000-000000000001";
const SECOND_ADMIN = "10000000-0000-4000-8000-000000000002";
const INACTIVE_ADMIN = "10000000-0000-4000-8000-000000000003";
const STRANGER = "10000000-0000-4000-8000-000000000004";
const SIBLING_USER = "10000000-0000-4000-8000-000000000005";
const MISSING = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const FACILITIES = ["ac", "parking", "rooms", "catering", "decoration", "kitchen", "power_backup", "lift", "accessible_entry"];
type Role = "anon" | "authenticated" | "service_role";
type Inputs = Record<string, unknown>;
type CityResults = { items: CitySummary[]; total: number };
type SitemapResults = { items: { path: string; updatedAt: string }[]; total: number };
type PhotoOwner = { venue_id?: string | null; city_id?: string | null };
type CleanupJob = { id: string; storage_key: string; created_at: string; ready_at: string };

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/0001_inventory.sql"), "utf8");
const storageMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/0002_storage.sql"), "utf8");
const sitemapMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/0003_sitemap.sql"), "utf8");
const mediaUploadsMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/0004_media_uploads.sql"), "utf8");
const seed = readFileSync(resolve(process.cwd(), "supabase/seed.sql"), "utf8");
let db: PGlite;
let sequence = 0;
let hazaribag: string;
let sharedBefore: Awaited<ReturnType<typeof sharedState>>;
let sharedAfter: Awaited<ReturnType<typeof sharedState>>;
let initialAllowlist: { id: string }[];

async function siblingData(database: PGlite = db): Promise<Inputs> {
  return (await database.query<{ value: Inputs }>(`select jsonb_build_object(
    'Category', (select jsonb_agg(to_jsonb(c) order by c.id) from public."Category" c),
    'Product', (select jsonb_agg(to_jsonb(p) order by p.id) from public."Product" p),
    'Order', (select jsonb_agg(to_jsonb(o) order by o.id) from public."Order" o),
    'ContactMessage', (select jsonb_agg(to_jsonb(m) order by m.id) from public."ContactMessage" m),
    'cities', (select jsonb_agg(to_jsonb(c) order by c.id) from public.cities c)
  ) as value`)).rows[0].value;
}

// Capture the shared project's existing objects and ACLs, not just row counts.
// These owner-only catalog/fixture snapshots are not application authorization probes.
async function sharedState(database: PGlite = db) {
  return {
    schemas: (await database.query(`select nspname, nspowner::text, nspacl::text
      from pg_catalog.pg_namespace where nspname in ('public', 'auth', 'storage') order by nspname`)).rows,
    relations: (await database.query(`select n.nspname, c.oid::text, c.relname, c.relkind,
      c.relowner::text, c.relacl::text, c.relrowsecurity, c.relforcerowsecurity
      from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('public', 'auth', 'storage') order by n.nspname, c.relname`)).rows,
    columns: (await database.query(`select n.nspname, c.relname, a.attname, a.attnum,
      a.atttypid::text, a.atttypmod, a.attnotnull, a.attacl::text
      from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('public', 'auth', 'storage') and a.attnum > 0 and not a.attisdropped
      order by n.nspname, c.relname, a.attnum`)).rows,
    functions: (await database.query(`select n.nspname, p.oid::text, p.proname, p.proowner::text,
      p.proacl::text, p.prosecdef, p.proconfig, pg_catalog.pg_get_functiondef(p.oid) as definition
      from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'auth', 'storage') and p.prokind = 'f'
      order by n.nspname, p.proname, p.oid`)).rows,
    defaultPrivileges: (await database.query(`select defaclrole::text, defaclnamespace::text, defaclobjtype, defaclacl::text
      from pg_catalog.pg_default_acl order by defaclrole, defaclnamespace, defaclobjtype`)).rows,
    roles: (await database.query(`select rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb,
      rolcanlogin, rolreplication, rolbypassrls, rolconfig from pg_catalog.pg_roles order by rolname`)).rows,
    policies: (await database.query(`select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
      from pg_catalog.pg_policies where schemaname in ('public', 'auth', 'storage')
        and not (schemaname = 'storage' and tablename = 'objects' and policyname ~ '^shagun_media_')
      order by schemaname, tablename, policyname`)).rows,
    buckets: (await database.query(`select to_jsonb(b) as value from storage.buckets b
      where id <> 'shagun-media' order by id`)).rows,
    objects: (await database.query(`select to_jsonb(o) as value from storage.objects o
      where bucket_id is distinct from 'shagun-media' order by id`)).rows,
    users: (await database.query<{ id: string }>("select id from auth.users order by id")).rows,
    siblingData: await siblingData(database),
  };
}

// A real non-superuser role is used for EVERY application read/write probe.
// Each call commits its own transaction: transaction timestamps must be allowed
// to change. A single outer rollback transaction would hide versioning bugs.
async function rows<T = Record<string, unknown>>(
  sql: string, params: unknown[] = [], role: Role = "authenticated", subject: string | null = ADMIN,
): Promise<T[]> {
  await db.exec("begin");
  try {
    await db.exec(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [subject ?? ""]);
    const result = await db.query<T>(sql, params);
    await db.exec("commit");
    return result.rows;
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}

async function value<T>(expression: string, params: unknown[] = [], role: Role = "authenticated", subject: string | null = ADMIN): Promise<T> {
  return (await rows<{ value: T }>(`select ${expression} as value`, params, role, subject))[0].value;
}

// Names/argument identifiers are test-source constants, not application input.
async function rpc<T>(name: string, args: Inputs = {}, role: Role = "authenticated", subject: string | null = ADMIN): Promise<T> {
  const entries = Object.entries(args);
  return value<T>(`shagun.${name}(${entries.map(([key], i) => `${key} => $${i + 1}`).join(", ")})`, entries.map(([, v]) => v), role, subject);
}

async function count(table: string, role: Role = "authenticated", subject: string | null = ADMIN) {
  return value<number>(`(select count(*)::integer from ${table})`, [], role, subject);
}

async function city(id = hazaribag): Promise<City> {
  return value<City>("(select to_jsonb(c) from shagun.cities c where c.id = $1)", [id]);
}

async function document(id: string): Promise<PublicVenue> {
  const result = await rpc<PublicVenue | null>("venue_document", { p_id: id });
  if (!result) throw new Error("Synthetic venue fixture was unexpectedly invisible to the active admin");
  return result;
}

async function research(id: string): Promise<VenueResearch> {
  return value<VenueResearch>("(select to_jsonb(r) from shagun.venue_research r where r.venue_id = $1)", [id]);
}

function cityInput(overrides: Inputs = {}): Inputs {
  return { name: "Synthetic River City", slug: "synthetic-river-city", state: "Synthetic Test State", country: "India",
    description: "Synthetic test city; not a production listing.", status: "draft", seo_title: null, seo_description: null, metadata: {}, ...overrides };
}

function venueInput(cityId = hazaribag, overrides: Inputs = {}): Inputs {
  const number = ++sequence;
  return {
    city_id: cityId, name: `Synthetic Hall ${number}`, slug: `synthetic-hall-${number}`,
    description: "Synthetic venue fixture only.", venue_type: "vivah_bhawan", address: "123 Synthetic Test Road", locality: "Synthetic Market",
    phone: null, alternate_phone: null, whatsapp: null, email: null, capacity_min: null, capacity_max: null,
    price_min: null, price_max: null, price_type: null, latitude: null, longitude: null,
    status: "draft", verification_status: "unverified", verified_at: null, seo_title: null, seo_description: null,
    source_notes: "Synthetic private test provenance; this is not a real venue.", reviewed: false, facilities: [], ...overrides,
  };
}

async function createCity(overrides: Inputs = {}) {
  return rpc<string>("save_city", { p_data: JSON.stringify(cityInput(overrides)) });
}

async function editCity(id: string, changes: Inputs, expected?: string | null) {
  const original = await city(id);
  return rpc<string>("save_city", { p_data: JSON.stringify({ ...original, ...changes }), p_id: id,
    p_expected: expected === undefined ? original.updated_at : expected });
}

async function createVenue(overrides: Inputs = {}, cityId = hazaribag) {
  return rpc<string>("save_venue", { p_data: JSON.stringify(venueInput(cityId, overrides)) });
}

async function editVenue(id: string, changes: Inputs, expected?: string | null, subject = ADMIN) {
  const original = await document(id);
  const notes = await research(id);
  return rpc<string>("save_venue", { p_id: id, p_expected: expected === undefined ? original.updated_at : expected,
    p_data: JSON.stringify({ ...original, source_notes: notes.source_notes, reviewed: false, ...changes }) }, "authenticated", subject);
}

async function published(overrides: Inputs = {}, cityId = hazaribag) {
  return createVenue({ status: "published", reviewed: true, ...overrides }, cityId);
}

async function activate(id = hazaribag) { await editCity(id, { status: "active" }); }

async function photo(owner: PhotoOwner, overrides: Inputs = {}): Promise<Photo> {
  const data = { id: randomUUID(), venue_id: null, city_id: null, storage_key: randomUUID(),
    alt_text: "Synthetic test photograph", credit: "Synthetic fixture rights note only", width: 1600, height: 900,
    sort_order: 0, is_cover: false, ...owner, ...overrides };
  const result = await rows<{ value: Photo }>(`insert into shagun.media_assets
    (id, venue_id, city_id, storage_key, alt_text, credit, width, height, sort_order, is_cover)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning to_jsonb(media_assets) as value`,
  [data.id, data.venue_id, data.city_id, data.storage_key, data.alt_text, data.credit, data.width, data.height, data.sort_order, data.is_cover]);
  return result[0].value;
}

function uploadInput(storageKey: string, owner: PhotoOwner, overrides: Inputs = {}): Inputs {
  return { storage_key: storageKey, venue_id: null, city_id: null,
    alt_text: "Synthetic reserved photograph", credit: "Synthetic upload rights note only", width: 1600, height: 900,
    ...owner, ...overrides };
}

async function cleanupJob(storageKey: string, role: Role = "authenticated", subject: string | null = ADMIN): Promise<CleanupJob | null> {
  return value<CleanupJob | null>("(select to_jsonb(j) from shagun.storage_cleanup_jobs j where storage_key = $1)", [storageKey], role, subject);
}

async function reserveUpload(storageKey = randomUUID()): Promise<CleanupJob> {
  await rpc<void>("begin_media_upload", { p_key: storageKey });
  const result = await cleanupJob(storageKey);
  if (!result) throw new Error("Synthetic upload reservation was unexpectedly unavailable to the active admin");
  return result;
}

async function finalizeUpload(storageKey: string, owner: PhotoOwner, overrides: Inputs = {}): Promise<Photo> {
  return rpc<Photo>("finalize_media_upload", { p_data: JSON.stringify(uploadInput(storageKey, owner, overrides)) });
}

async function search(args: Inputs = {}, role: Role = "anon", subject: string | null = null): Promise<SearchResult> {
  return rpc<SearchResult>("search_venues", args, role, subject);
}

async function remove(kind: "city" | "venue", id: string, overrides: Inputs = {}) {
  const original = kind === "city" ? await city(id) : await document(id);
  return rpc<void>("delete_record", { p_kind: kind, p_id: id, p_name: original.name, p_expected: original.updated_at, ...overrides });
}

// Synthetic shared-project bootstrap only: never run this against managed Supabase.
async function bootstrapSharedProject(database: PGlite) {
  await database.exec(`
    create role anon nologin nosuperuser nobypassrls;
    create role authenticated nologin nosuperuser nobypassrls;
    create role service_role nologin nosuperuser bypassrls;
    create role synthetic_storage_owner nologin nosuperuser nobypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable set search_path = '' as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    create schema storage;
    create table storage.buckets (
      id text primary key, name text not null, public boolean not null default false,
      file_size_limit bigint, allowed_mime_types text[]
    );
    create table storage.objects (
      id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
      name text not null, owner uuid, metadata jsonb, unique (bucket_id, name)
    );
    -- Managed Storage, not the Shagun migration, already enables RLS. NULL
    -- bucket IDs deliberately model legacy rows outside every named bucket.
    alter table storage.objects enable row level security;
    -- Table ownership does not imply schema USAGE. FK checks resolve
    -- storage.buckets as its owner, even during superuser fixture inserts.
    -- Establish provider access before ownership transfer; keep JWT grants
    -- separate so the missing-privilege preflight cases still fail unchanged.
    grant usage on schema storage to synthetic_storage_owner;
    alter table storage.objects owner to synthetic_storage_owner;
    alter table storage.buckets owner to synthetic_storage_owner;
    grant usage on schema storage to anon, authenticated, service_role;
    grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
    grant select on storage.buckets to anon, authenticated, service_role;
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values ('synthetic-other-bucket', 'Synthetic sibling bucket', true, 1048576, array['image/jpeg', 'image/png']);
    create policy synthetic_legacy_broad_policy on storage.objects for all to anon, authenticated
      using (true) with check (true);
    create policy synthetic_sibling_read on storage.objects for select to anon, authenticated
      using (bucket_id = 'synthetic-other-bucket');

    -- Intentionally nontrivial existing public ACLs catch accidental global
    -- revokes/grants. These are local fixtures, not recommended production ACLs.
    grant usage, create on schema public to public, anon, authenticated;
    grant usage on schema public to service_role;
    create table public."Category" (id text primary key, name text not null);
    create table public."Product" (
      id text primary key, category_id text not null references public."Category"(id), name text not null
    );
    create table public."Order" (
      id text primary key, product_id text not null references public."Product"(id), user_id uuid not null, status text not null
    );
    create table public."ContactMessage" (id text primary key, message text not null);
    create table public.cities (id text primary key, name text not null);
    -- A deliberately permissive sibling function must NEVER authorize Shagun.
    create function public.is_admin() returns boolean language sql stable set search_path = '' as $$ select true; $$;
    grant select on public."Category", public."Product", public.cities to anon, authenticated;
    grant select, insert on public."Order", public."ContactMessage" to authenticated;
    grant update (name) on public."Product" to authenticated;
    grant all on public."Category", public."Product", public."Order", public."ContactMessage", public.cities to service_role;
    insert into public."Category" values ('synthetic-category', 'Synthetic sibling category');
    insert into public."Product" values ('synthetic-product', 'synthetic-category', 'Synthetic sibling product');
    insert into public."ContactMessage" values ('synthetic-contact', 'Synthetic sibling message; no real contact data');
    insert into public.cities values ('synthetic-sibling-city', 'Synthetic sibling city sentinel');
  `);
  // No sibling FK targets auth.users: the per-test synthetic Auth reset must not
  // cascade into the public sentinels that persist throughout the suite.
  await database.query("insert into auth.users (id) values ($1)", [SIBLING_USER]);
  await database.query(`insert into public."Order" values ('synthetic-order', 'synthetic-product', $1, 'synthetic-only')`, [SIBLING_USER]);
  await database.query(`insert into storage.objects (bucket_id, name, owner, metadata) values
    ('synthetic-other-bucket', 'synthetic-existing-object.jpg', $1, '{"synthetic":true,"keep":"sibling-metadata"}'),
    (null, 'synthetic-existing-bucketless-object', $1, '{"synthetic":true,"keep":"bucketless-metadata"}')`, [SIBLING_USER]);
}

beforeAll(async () => {
  db = new PGlite();
  await bootstrapSharedProject(db);
  sharedBefore = await sharedState();
  await db.exec(migration);
  await db.exec(storageMigration);
  await db.exec(sitemapMigration);
  await db.exec(mediaUploadsMigration);
  sharedAfter = await sharedState();
  initialAllowlist = (await db.query<{ id: string }>("select id from shagun.admin_users order by id")).rows;
}, 120_000);

beforeEach(async () => {
  // Only fixture reset/provisioning uses the database owner, never an RLS probe.
  // Never truncate the persistent sibling public tables or their sentinels.
  await db.exec(`truncate shagun.analytics_daily, shagun.rate_limits, shagun.storage_cleanup_jobs,
    shagun.media_assets, shagun.venue_facilities, shagun.venue_research, shagun.venues, shagun.cities,
    shagun.admin_users, auth.users, storage.objects cascade`);
  await db.exec(seed);
  await db.query("insert into auth.users (id) values ($1), ($2), ($3), ($4), ($5)", [ADMIN, SECOND_ADMIN, INACTIVE_ADMIN, STRANGER, SIBLING_USER]);
  await rows(`insert into shagun.admin_users (id, display_name, is_active) values
    ($1, 'Synthetic editor one', true), ($2, 'Synthetic editor two', true), ($3, 'Synthetic inactive editor', false)`,
  [ADMIN, SECOND_ADMIN, INACTIVE_ADMIN], "service_role", null);
  hazaribag = (await db.query<{ id: string }>("select id from shagun.cities where slug = 'hazaribag'")).rows[0].id;
  sequence = 0;
}, 30_000);

afterAll(async () => { if (db) await db.close(); });

describe("shared Supabase namespace isolation", () => {
  it("preserves sibling data, shared schema/object ACLs, Storage ownership/RLS, policies and metadata", async () => {
    expect(sharedBefore.users).toEqual([{ id: SIBLING_USER }]);
    expect(sharedBefore.objects).toHaveLength(2);
    expect(sharedBefore.buckets).toHaveLength(1);
    for (const table of ["Category", "Product", "Order", "ContactMessage", "cities"]) {
      expect(sharedBefore.siblingData[table]).toHaveLength(1);
    }
    expect(sharedAfter).toEqual(sharedBefore);
    // The normal per-test seed/reset also leaves the public sentinels untouched.
    expect(await siblingData()).toEqual(sharedBefore.siblingData);
    expect(await value<boolean>("public.is_admin()", [], "anon", null)).toBe(true);
    expect(await count('public."Category"', "anon", null)).toBe(1);
    expect(await count('public."Product"', "anon", null)).toBe(1);
    expect(await count("public.cities", "anon", null)).toBe(1);
    expect(await count('public."Order"', "authenticated", SIBLING_USER)).toBe(1);
    expect(await count('public."ContactMessage"', "authenticated", SIBLING_USER)).toBe(1);
  });

  it("grants schema usage without creation and preserves the explicit grants on all 17 Shagun RPCs", async () => {
    for (const role of ["anon", "authenticated", "service_role"] as const) {
      expect(await rows(`select
        has_schema_privilege(current_user, 'shagun', 'USAGE') as inventory_usage,
        has_schema_privilege(current_user, 'shagun', 'CREATE') as inventory_create,
        has_schema_privilege(current_user, 'shagun_private', 'USAGE') as helper_usage,
        has_schema_privilege(current_user, 'shagun_private', 'CREATE') as helper_create`, [], role, null))
        .toEqual([{ inventory_usage: true, inventory_create: false, helper_usage: true, helper_create: false }]);
    }
    const expected: Record<string, Role[]> = {
      admin_city_summaries: ["authenticated"],
      admin_dashboard: ["authenticated"],
      admin_venues: ["authenticated"],
      begin_media_upload: ["authenticated"],
      city_facets: ["anon", "authenticated", "service_role"],
      consume_rate_limit: ["service_role"],
      delete_record: ["authenticated"],
      finalize_media_upload: ["authenticated"],
      is_admin: ["authenticated", "service_role"],
      public_cities: ["anon", "authenticated", "service_role"],
      record_event: ["service_role"],
      save_city: ["authenticated"],
      save_venue: ["authenticated"],
      search_venues: ["anon", "authenticated", "service_role"],
      sitemap_entries: ["anon", "authenticated", "service_role"],
      update_photo: ["authenticated"],
      venue_document: ["anon", "authenticated", "service_role"],
    };
    const functions = await rows<{ name: string; roles: Role[] }>(`select p.proname as name, array(
      select r.name from unnest(array['anon', 'authenticated', 'service_role']) with ordinality r(name, position)
      where has_function_privilege(r.name, p.oid, 'EXECUTE') order by r.position
    ) as roles from pg_catalog.pg_proc p
      where p.pronamespace = 'shagun'::regnamespace and p.prokind = 'f' order by p.proname`);
    expect(functions).toHaveLength(17);
    expect(functions).toEqual(Object.entries(expected).map(([name, roles]) => ({ name, roles })));
  });

  it("never auto-allowlists a sibling Auth user or trusts the sibling public admin function", async () => {
    expect(initialAllowlist).toEqual([]);
    expect(await value<string>("auth.uid()", [], "authenticated", SIBLING_USER)).toBe(SIBLING_USER);
    expect(await value<boolean>("public.is_admin()", [], "authenticated", SIBLING_USER)).toBe(true);
    expect(await rpc("is_admin", {}, "authenticated", SIBLING_USER)).toBe(false);
    expect(await count("shagun.admin_users", "authenticated", SIBLING_USER)).toBe(0);
    const draft = await createVenue();
    const live = await published();
    await activate();
    for (const [role, user] of [["anon", null], ["authenticated", SIBLING_USER]] as const) {
      expect(await rpc("venue_document", { p_id: draft }, role, user)).toBeNull();
      expect((await search({}, role, user)).items.map((venue) => venue.id)).toEqual([live]);
      await expect(rpc("admin_dashboard", {}, role, user)).rejects.toMatchObject({ code: "42501" });
      await expect(rpc("save_city", { p_data: JSON.stringify(cityInput()) }, role, user)).rejects.toMatchObject({ code: "42501" });
      await expect(rpc("save_venue", { p_data: JSON.stringify(venueInput()) }, role, user)).rejects.toMatchObject({ code: "42501" });
      await expect(rpc("begin_media_upload", { p_key: randomUUID() }, role, user)).rejects.toMatchObject({ code: "42501" });
      await expect(rows("insert into shagun.cities (name, slug, state) values ('Synthetic intrusion', 'synthetic-intrusion', 'Synthetic state')", [], role, user))
        .rejects.toMatchObject({ code: "42501" });
      await expect(rows("insert into storage.objects (bucket_id, name) values ('shagun-media', $1)", [`${randomUUID()}/480.webp`], role, user))
        .rejects.toMatchObject({ code: "42501" });
    }
    await expect(rows("insert into shagun.admin_users (id, display_name) values ($1, 'Synthetic sibling escalation')", [SIBLING_USER], "authenticated", SIBLING_USER))
      .rejects.toMatchObject({ code: "42501" });
    expect(await count("shagun.venue_research", "authenticated", SIBLING_USER)).toBe(0);
    expect(await count("shagun.admin_users", "service_role", null)).toBe(3);
    expect(await siblingData()).toEqual(sharedBefore.siblingData);
  }, 30_000);

  it("lets an executor roll back all four migrations and their exact SQL/checksum ledger together", async () => {
    const isolated = new PGlite();
    try {
      await bootstrapSharedProject(isolated);
      const before = await sharedState(isolated);
      const sources = [migration, storageMigration, sitemapMigration, mediaUploadsMigration];
      const expected = sources.map((sql_source, index) => ({
        version: index + 1, sql_source, sha256: createHash("sha256").update(sql_source).digest("hex"),
      }));
      await isolated.exec(`begin;
        create schema synthetic_runner;
        create table synthetic_runner.migrations (version integer primary key, sql_source text not null, sha256 text not null)`);
      try {
        for (const entry of expected) {
          await isolated.exec(entry.sql_source);
          await isolated.query("insert into synthetic_runner.migrations values ($1, $2, $3)", [entry.version, entry.sql_source, entry.sha256]);
        }
        expect((await isolated.query("select version, sql_source, sha256 from synthetic_runner.migrations order by version")).rows).toEqual(expected);
        expect((await isolated.query("select count(*)::integer as count from pg_catalog.pg_class where relnamespace = 'shagun'::regnamespace and relkind = 'r'")).rows)
          .toEqual([{ count: 10 }]);
        expect((await isolated.query("select count(*)::integer as count from storage.buckets where id = 'shagun-media'")).rows).toEqual([{ count: 1 }]);
      } finally { await isolated.exec("rollback"); }
      expect((await isolated.query("select nspname from pg_catalog.pg_namespace where nspname in ('shagun', 'shagun_private', 'synthetic_runner')")).rows).toEqual([]);
      expect((await isolated.query("select count(*)::integer as count from storage.buckets where id = 'shagun-media'")).rows).toEqual([{ count: 0 }]);
      expect(await sharedState(isolated)).toEqual(before);
    } finally { await isolated.close(); }
  }, 120_000);
});

describe("production schema and seed", () => {
  it("seeds only one draft Hazaribag and zero venues, idempotently", async () => {
    const original = await city();
    await db.exec(seed);
    await db.exec(seed);
    expect(await city()).toEqual(original);
    expect(original).toMatchObject({ name: "Hazaribag", slug: "hazaribag", state: "Jharkhand", country: "India", status: "draft", launched_at: null });
    expect(await count("shagun.cities")).toBe(1);
    expect(await count("shagun.venues")).toBe(0);
    expect(await count("shagun.media_assets")).toBe(0);
    expect(await count("shagun.storage_cleanup_jobs")).toBe(0);
    expect(await count("shagun.admin_users", "service_role", null)).toBe(3); // Test provisioning only; seed adds none.
  });

  it("never overwrites operator edits on re-seed", async () => {
    await editCity(hazaribag, { name: "Synthetic edited city name", status: "inactive", description: "Synthetic editorial edit", metadata: { synthetic: true } });
    const edited = await city();
    await db.exec(seed);
    expect(await city()).toEqual(edited);
  });

  it("installs the exact normalized facility vocabulary and a generated GIN search vector", async () => {
    const codes = await rows<{ code: string }>("select code from shagun.facilities order by sort_order");
    expect(codes.map((r) => r.code)).toEqual(FACILITIES);
    const id = await createVenue({ name: "Synthetic Lotus Hall", locality: "Synthetic Bazaar", address: "Synthetic Orchard Road" });
    const vector = await value<string>("(select search_document::text from shagun.venues where id = $1)", [id]);
    expect(vector).toContain("'lotus':");
    expect(vector).toContain("'bazaar':");
    expect(vector).toContain("'orchard':");
    const indexes = await db.query<{ indexdef: string }>("select indexdef from pg_indexes where schemaname = 'shagun' and indexname = 'venues_search_idx'");
    expect(indexes.rows[0].indexdef).toContain("USING gin (search_document)");
    await expect(rows("update shagun.venues set search_document = 'fake'::tsvector where id = $1", [id])).rejects.toMatchObject({ code: "428C9" });
  });

  it.each([
    ["uppercase slug", { slug: "Synthetic-City" }], ["double hyphen", { slug: "synthetic--city" }],
    ["short slug", { slug: "s" }], ["long name", { name: "x".repeat(101) }], ["blank state", { state: " " }],
    ["invalid lifecycle", { status: "published" }], ["long description", { description: "x".repeat(2001) }],
    ["long SEO title", { seo_title: "x".repeat(71) }], ["long SEO description", { seo_description: "x".repeat(181) }],
    ["nested private metadata", { metadata: { nested: { secret: true } } }], ["array metadata", { metadata: [] }],
    ["long metadata key", { metadata: { ["x".repeat(101)]: true } }], ["long metadata value", { metadata: { note: "x".repeat(501) } }],
    ["oversized metadata", { metadata: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`synthetic${i}`, "x".repeat(450)])) }],
  ])("rejects city constraint violations: %s", async (_label, invalid) => {
    await expect(createCity(invalid as Inputs)).rejects.toMatchObject({ code: "23514" });
    expect(await count("shagun.cities")).toBe(1);
  });

  it.each([
    ["capacity reversed", { capacity_min: 200, capacity_max: 100 }], ["zero capacity", { capacity_max: 0 }],
    ["excess capacity", { capacity_max: 100001 }], ["price reversed", { price_min: 200, price_max: 100, price_type: "per_day" }],
    ["zero price", { price_min: 0, price_type: "per_day" }], ["price without basis", { price_min: 100 }],
    ["excess price", { price_max: 100000001, price_type: "per_event" }], ["invalid basis", { price_type: "per_person" }],
    ["unpaired coordinates", { latitude: 23 }], ["invalid latitude", { latitude: 91, longitude: 80 }],
    ["invalid longitude", { latitude: 20, longitude: -181 }], ["invalid phone", { phone: "09000000000" }],
    ["invalid WhatsApp", { whatsapp: "+00000" }], ["invalid email", { email: "not-an-email" }],
    ["invalid type", { venue_type: "palace" }], ["invalid status", { status: "active" }],
    ["invalid verification", { verification_status: "approved" }], ["invalid slug", { slug: "synthetic_venue" }],
    ["long address", { address: "x".repeat(601) }], ["long locality", { locality: "x".repeat(151) }],
    ["long description", { description: "x".repeat(8001) }], ["long sources", { source_notes: "x".repeat(8001) }],
    ["future verification", { verified_at: "2999-01-01T00:00:00Z" }],
  ])("enforces venue database constraints: %s", async (_label, invalid) => {
    await expect(createVenue(invalid as Inputs)).rejects.toMatchObject({ code: "23514" });
    expect(await count("shagun.venues")).toBe(0);
    expect(await count("shagun.venue_research")).toBe(0);
    expect(await count("shagun.venue_facilities")).toBe(0);
  });

  it("accepts valid bounds, paired coordinates, max-only prices and UTC ISO verification dates", async () => {
    const id = await createVenue({ capacity_min: 1, capacity_max: 100000, price_max: 100000000, price_type: "per_event",
      latitude: -90, longitude: 180, verification_status: "verified", verified_at: "2020-01-02", reviewed: true });
    const data = await document(id);
    expect(data).toMatchObject({ price_min: null, price_max: 100000000, latitude: -90, longitude: 180 });
    // JSON uses the database session's offset; the date-only input is UTC.
    expect(Date.parse(data.verified_at!)).toBe(Date.parse("2020-01-02T00:00:00Z"));
    await expect(createVenue({ verified_at: "now" })).rejects.toMatchObject({ code: "22007" });
    await expect(createVenue({ verified_at: "infinity" })).rejects.toMatchObject({ code: "22007" });
    await expect(createVenue({ verified_at: "01/02/2020" })).rejects.toMatchObject({ code: "22007" });
  });

  it("enforces slug uniqueness per city but supports a dynamically added second city", async () => {
    const other = await createCity();
    const first = await createVenue({ slug: "synthetic-shared-slug" });
    const second = await createVenue({ slug: "synthetic-shared-slug" }, other);
    expect(first).not.toBe(second);
    expect(await count("shagun.cities")).toBe(2);
    await expect(createVenue({ slug: "synthetic-shared-slug" })).rejects.toMatchObject({ code: "23505" });
    await expect(createCity()).rejects.toMatchObject({ code: "23505" });
  });

  it("ignores untrusted IDs, generated fields, reviewer IDs and audit timestamps in JSON", async () => {
    const id = await createVenue({ id: MISSING, updated_at: "invalid", published_at: "invalid", created_at: "invalid",
      search_document: { synthetic: true }, reviewed_by: STRANGER, reviewed_at: "invalid", is_active: true });
    const saved = await document(id);
    expect(id).not.toBe(MISSING);
    expect(saved).toMatchObject({ published_at: null, verified_at: null, verification_status: "unverified" });
    expect((await research(id)).reviewed_by).toBeNull();
    expect(saved.created_at).not.toBe("invalid");
    const added = await createCity({ id: MISSING, launched_at: "invalid", updated_at: "invalid", created_at: "invalid", is_admin: true });
    expect(added).not.toBe(MISSING);
    expect((await city(added)).launched_at).toBeNull();
  });
});

describe("actual JWT-role RLS and private/public separation", () => {
  it("proves probes run under non-superuser roles, not PGlite's owner", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      const probe = await rows<{ role: string; rolsuper: boolean; rolbypassrls: boolean }>(
        "select current_user as role, rolsuper, rolbypassrls from pg_roles where rolname = current_user", [], role, null);
      expect(probe[0]).toEqual({ role, rolsuper: false, rolbypassrls: false });
    }
    expect(await rpc("is_admin", {}, "authenticated", ADMIN)).toBe(true);
    expect(await rpc("is_admin", {}, "authenticated", STRANGER)).toBe(false);
    expect(await rpc("is_admin", {}, "authenticated", null)).toBe(false);
    expect(await rpc("is_admin", {}, "authenticated", INACTIVE_ADMIN)).toBe(false);
  });

  it("hides published venues, media, facets and city metadata while the city is still draft", async () => {
    await editCity(hazaribag, { metadata: { synthetic_draft_marker: "must not appear yet" } });
    const id = await published({ facilities: ["ac", "parking"], capacity_max: 100, price_min: 900, price_type: "per_plate" });
    await photo({ venue_id: id });
    await photo({ city_id: hazaribag });
    for (const table of ["cities", "venues", "media_assets", "venue_facilities", "facilities"]) {
      expect(await count(`shagun.${table}`, "anon", null)).toBe(0);
    }
    expect(await rpc("venue_document", { p_id: id }, "anon", null)).toBeNull();
    expect(await rpc("venue_document", { p_id: id }, "authenticated", STRANGER)).toBeNull();
    expect(await search()).toMatchObject({ total: 0, items: [] });
    expect(await rpc("public_cities", {}, "anon", null)).toEqual({ total: 0, items: [] });
    expect(await rpc("city_facets", { p_city: hazaribag }, "anon", null)).toEqual({ facilities: [], venueTypes: [], hasCapacity: false, priceTypes: [] });
    const preview = await document(id);
    expect(preview.city.metadata).toEqual({ synthetic_draft_marker: "must not appear yet" });
    expect(preview.photos).toHaveLength(1);
    expect(preview.facilities).toEqual(["ac", "parking"]);
  });

  it("exposes only published active inventory, public metadata and public-only counts to every public RPC", async () => {
    const id = await published({ facilities: ["parking", "ac"], source_notes: "SYNTHETIC_PRIVATE_SOURCE_NEVER_SERIALIZE" });
    await photo({ venue_id: id });
    const cover = await photo({ city_id: hazaribag });
    await createVenue({ facilities: ["lift"], name: "Synthetic Hidden Draft" });
    const other = await createCity({ metadata: { synthetic_draft_secret: "hidden city metadata" } });
    await published({ name: "Synthetic Private City Venue" }, other);
    await editCity(hazaribag, { metadata: { editorial_region: "Synthetic public metadata", scalar: true } });
    await activate();
    for (const [role, user] of [["anon", null], ["authenticated", STRANGER], ["authenticated", ADMIN]] as const) {
      const list = await search({}, role, user);
      expect(list.total).toBe(1);
      expect(list.items.map((v) => v.id)).toEqual([id]);
      const cities = await rpc<CityResults>("public_cities", {}, role, user);
      expect(cities.total).toBe(1);
      expect(cities.items[0]).toMatchObject({ total_count: 1, published_count: 1, draft_count: 0, review_count: 0, cover: { id: cover.id } });
      expect(cities.items[0].metadata).toEqual({ editorial_region: "Synthetic public metadata", scalar: true });
      const serialized = JSON.stringify({ list, cities });
      expect(serialized).not.toContain("SYNTHETIC_PRIVATE_SOURCE");
      expect(serialized).not.toContain("source_notes");
      expect(serialized).not.toContain("reviewed_by");
      expect(serialized).not.toContain("search_document");
      expect(serialized).not.toContain("synthetic_draft_secret");
    }
    expect(await count("shagun.venues", "anon", null)).toBe(1);
    expect(await count("shagun.media_assets", "anon", null)).toBe(2);
    expect(await rows("select * from shagun.facilities order by code", [], "anon", null)).toHaveLength(2);
    await expect(count("shagun.venue_research", "anon", null)).rejects.toMatchObject({ code: "42501" });
    expect(await count("shagun.venue_research", "authenticated", STRANGER)).toBe(0);
    expect((await research(id)).source_notes).toBe("SYNTHETIC_PRIVATE_SOURCE_NEVER_SERIALIZE");
  });

  it("unpublishing immediately hides all nested venue relationships and positive facets", async () => {
    const id = await published({ facilities: ["ac"], capacity_max: 100, price_min: 100, price_type: "per_day" });
    await photo({ venue_id: id });
    await activate();
    expect((await search()).total).toBe(1);
    await editVenue(id, { status: "unpublished" });
    expect(await rpc("venue_document", { p_id: id }, "anon", null)).toBeNull();
    for (const table of ["venues", "media_assets", "venue_facilities", "facilities"]) expect(await count(`shagun.${table}`, "anon", null)).toBe(0);
    expect(await rpc("city_facets", { p_city: hazaribag }, "anon", null)).toEqual({ facilities: [], venueTypes: [], hasCapacity: false, priceTypes: [] });
    expect((await city()).status).toBe("active"); // Empty active pages remain valid; application must noindex them.
    expect((await rpc<CityResults>("public_cities", {}, "anon", null)).items[0]).toMatchObject({ published_count: 0, total_count: 0 });
    await editCity(hazaribag, { description: "Synthetic empty city description edit" }); // Does not re-run activation readiness.
    await editCity(hazaribag, { status: "inactive" });
    expect((await rpc<CityResults>("public_cities", {}, "anon", null)).total).toBe(0);
    await expect(activate()).rejects.toMatchObject({ code: "23514", message: "city_requires_published_venue" });
  });

  it("keeps inactive-city covers and otherwise published venues private", async () => {
    const id = await published();
    await photo({ city_id: hazaribag });
    await activate();
    await editCity(hazaribag, { status: "inactive" });
    expect(await count("shagun.cities", "anon", null)).toBe(0);
    expect(await count("shagun.media_assets", "anon", null)).toBe(0);
    expect(await rpc("venue_document", { p_id: id }, "anon", null)).toBeNull();
    expect((await search({}, "authenticated", ADMIN)).total).toBe(0);
  });

  it("allows only own allowlist reads and cannot self-escalate or edit the allowlist", async () => {
    const own = await rows<{ id: string }>("select id from shagun.admin_users", [], "authenticated", ADMIN);
    expect(own).toEqual([{ id: ADMIN }]);
    expect(await count("shagun.admin_users", "authenticated", STRANGER)).toBe(0);
    expect(await count("shagun.admin_users", "authenticated", INACTIVE_ADMIN)).toBe(1);
    await expect(count("shagun.admin_users", "anon", null)).rejects.toMatchObject({ code: "42501" });
    for (const user of [ADMIN, STRANGER]) {
      await expect(rows("insert into shagun.admin_users (id, display_name) values ($1, 'Synthetic attempted escalation')", [STRANGER], "authenticated", user))
        .rejects.toMatchObject({ code: "42501" });
      await expect(rows("update shagun.admin_users set is_active = true where id = $1", [INACTIVE_ADMIN], "authenticated", user))
        .rejects.toMatchObject({ code: "42501" });
      await expect(rows("delete from shagun.admin_users where id = $1", [ADMIN], "authenticated", user)).rejects.toMatchObject({ code: "42501" });
    }
    await rows("insert into shagun.admin_users (id, display_name) values ($1, 'Synthetic provisioned editor')", [STRANGER], "service_role", null);
    expect(await rpc("is_admin", {}, "authenticated", STRANGER)).toBe(true);
  });

  it.each(["admin_dashboard", "admin_city_summaries", "admin_venues"])("guards %s against strangers and revoked admins", async (name) => {
    for (const user of [STRANGER, INACTIVE_ADMIN, null]) await expect(rpc(name, {}, "authenticated", user)).rejects.toMatchObject({ code: "42501" });
    await expect(rpc(name, {}, "anon", null)).rejects.toMatchObject({ code: "42501" });
  });

  it("requires a current active membership for mutations and preview, not merely an authenticated JWT", async () => {
    const id = await createVenue();
    for (const user of [STRANGER, INACTIVE_ADMIN, null]) {
      await expect(rpc("save_city", { p_data: JSON.stringify(cityInput()) }, "authenticated", user)).rejects.toMatchObject({ code: "42501" });
      await expect(rpc("save_venue", { p_data: JSON.stringify(venueInput()) }, "authenticated", user)).rejects.toMatchObject({ code: "42501" });
      await expect(rpc("delete_record", { p_kind: "venue", p_id: id, p_name: "synthetic", p_expected: "2020-01-01" }, "authenticated", user)).rejects.toMatchObject({ code: "42501" });
      await expect(rpc("update_photo", { p_id: MISSING, p_operation: "cover" }, "authenticated", user)).rejects.toMatchObject({ code: "42501" });
      expect(await rpc("venue_document", { p_id: id }, "authenticated", user)).toBeNull();
    }
    await rows("update shagun.admin_users set is_active = false where id = $1", [ADMIN], "service_role", null);
    expect(await rpc("venue_document", { p_id: id }, "authenticated", ADMIN)).toBeNull();
    await expect(rpc("admin_dashboard")).rejects.toMatchObject({ code: "42501" });
    expect(await rpc("venue_document", { p_id: id }, "authenticated", SECOND_ADMIN)).toMatchObject({ id });
  });

  it.each(["cities", "venues", "facilities", "venue_facilities", "venue_research", "media_assets", "admin_users", "storage_cleanup_jobs", "rate_limits", "analytics_daily"])
    ("grants anon no write privileges on %s", async (table) => {
      await expect(rows(`insert into shagun.${table} default values`, [], "anon", null)).rejects.toMatchObject({ code: "42501" });
      await expect(rows(`delete from shagun.${table}`, [], "anon", null)).rejects.toMatchObject({ code: "42501" });
    });
});

describe("publication, editorial review, stable URLs and optimistic writes", () => {
  it("requires real reviewed inventory before activation but permits publication into a draft city", async () => {
    await expect(activate()).rejects.toMatchObject({ code: "23514", message: "city_requires_published_venue" });
    await expect(createCity({ status: "active" })).rejects.toMatchObject({ code: "23514" });
    const id = await published();
    const venue = await document(id);
    expect(venue.status).toBe("published");
    expect(venue.published_at).not.toBeNull();
    expect(venue.verified_at).toBeNull();
    expect(venue.verification_status).toBe("unverified"); // Editorial review is not dated verification.
    expect((await city()).status).toBe("draft");
    expect((await research(id)).reviewed_by).toBe(ADMIN);
    await activate();
    expect((await city()).launched_at).not.toBeNull();
    expect((await search()).items[0].verification_status).toBe("unverified");
  });

  it.each([
    ["no editorial confirmation", { reviewed: false }], ["no address", { address: null }],
    ["blank address", { address: "   " }], ["no research", { source_notes: "" }],
    ["verified without a date", { verification_status: "verified", verified_at: null }],
  ])("rejects incomplete publication atomically: %s", async (_name, invalid) => {
    await expect(published({ facilities: ["ac", "parking"], ...invalid as Inputs })).rejects.toMatchObject({ code: "23514" });
    expect(await count("shagun.venues")).toBe(0);
    expect(await count("shagun.venue_research")).toBe(0);
    expect(await count("shagun.venue_facilities")).toBe(0);
  });

  it("enforces publication and review invariants on direct REST-style writes, too", async () => {
    const id = await createVenue();
    await expect(rows("update shagun.venues set status = 'published' where id = $1", [id])).rejects.toMatchObject({ code: "23514", message: "editorial_review_required" });
    await editVenue(id, { reviewed: true });
    // A saved, current review can support a direct status-only publication.
    await rows("update shagun.venues set status = 'published' where id = $1", [id]);
    await expect(rows("update shagun.venues set phone = '+919000000000' where id = $1", [id])).rejects.toMatchObject({ code: "23514" });
    await expect(rows("update shagun.venue_research set source_notes = 'Synthetic changed private notes' where venue_id = $1", [id]))
      .rejects.toMatchObject({ code: "23514" });
    await expect(rows("delete from shagun.venue_research where venue_id = $1", [id])).rejects.toMatchObject({ code: "23514" });
    await expect(rows("insert into shagun.venue_facilities (venue_id, facility_code) values ($1, 'parking')", [id]))
      .rejects.toMatchObject({ code: "23514", message: "save_facilities_with_editorial_review" });
    await expect(rows("update shagun.venue_research set reviewed_at = transaction_timestamp(), reviewed_by = $2 where venue_id = $1", [id, SECOND_ADMIN]))
      .rejects.toMatchObject({ code: "42501", message: "reviewer_must_be_current_admin" });
    expect((await document(id)).phone).toBeNull();
    expect((await research(id)).source_notes).toContain("Synthetic private test provenance");
  });

  it("requires a fresh review for a changed verification date and cannot fabricate review dates", async () => {
    const id = await createVenue({ reviewed: true });
    await expect(rows("update shagun.venues set verification_status = 'verified', verified_at = '2020-01-01' where id = $1", [id]))
      .rejects.toMatchObject({ code: "23514", message: "verification_requires_fresh_review" });
    const before = await research(id);
    await rows("update shagun.venue_research set reviewed_at = '1900-01-01', reviewed_by = $2 where venue_id = $1", [id, ADMIN]);
    const after = await research(id);
    expect(after.reviewed_at).not.toBe(before.reviewed_at);
    expect(Date.parse(after.reviewed_at!)).toBeGreaterThan(Date.parse("2020-01-01"));
    await editVenue(id, { verification_status: "verified", verified_at: "2020-01-01T10:30:00+05:30", reviewed: true });
    const verified = await document(id);
    expect(Date.parse(verified.verified_at!)).toBe(Date.parse("2020-01-01T05:00:00Z"));
  });

  it("re-reviews substantive changes atomically without minting a new verification date", async () => {
    const id = await published({ verification_status: "verified", verified_at: "2020-01-01T00:00:00Z", facilities: ["ac"] });
    const original = await document(id);
    await expect(editVenue(id, { capacity_max: 500, facilities: ["parking"] })).rejects.toMatchObject({ code: "23514" });
    expect(await document(id)).toEqual(original); // No partial draft, array, or timestamp on failed save.
    await editVenue(id, { capacity_max: 500, facilities: ["parking", "ac", "parking"], source_notes: "Synthetic rechecked source notes", reviewed: true });
    const updated = await document(id);
    expect(updated).toMatchObject({ status: "published", verification_status: "verified", capacity_max: 500, facilities: ["ac", "parking"] });
    expect(updated.verified_at).toBe(original.verified_at);
    expect(updated.published_at).toBe(original.published_at);
    expect(updated.created_at).toBe(original.created_at);
    expect((await research(id)).source_notes).toBe("Synthetic rechecked source notes");
  });

  it("invalidates review on unreviewed draft field, source or facility edits", async () => {
    const id = await createVenue({ reviewed: true });
    await rows("update shagun.venues set locality = 'Synthetic changed locality' where id = $1", [id]);
    expect((await research(id)).reviewed_at).toBeNull();
    await editVenue(id, { reviewed: true });
    await rows("update shagun.venue_research set source_notes = 'Synthetic new unreviewed source' where venue_id = $1", [id]);
    expect((await research(id)).reviewed_by).toBeNull();
    await editVenue(id, { reviewed: true });
    const previous = await document(id);
    await rows("insert into shagun.venue_facilities (venue_id, facility_code) values ($1, 'parking')", [id]);
    expect((await research(id)).reviewed_at).toBeNull();
    expect((await document(id)).updated_at).not.toBe(previous.updated_at);
  });

  it("allows a different active editor to work on previously reviewed inventory without recursive allowlist policies", async () => {
    const id = await published();
    const firstReview = await research(id);
    const image = await photo({ venue_id: id });
    await rpc("update_photo", { p_id: image.id, p_operation: "metadata", p_alt: "Synthetic second editor alt", p_credit: "Synthetic rights confirmed" }, "authenticated", SECOND_ADMIN);
    expect((await research(id)).reviewed_by).toBe(firstReview.reviewed_by);
    await editVenue(id, { reviewed: true, description: "Synthetic second editor revision" }, undefined, SECOND_ADMIN);
    expect((await research(id)).reviewed_by).toBe(SECOND_ADMIN);
    expect(await rows("select id from shagun.admin_users", [], "authenticated", SECOND_ADMIN)).toEqual([{ id: SECOND_ADMIN }]);
  });

  it("locks city slugs after first launch and venue slugs/city after first publication, even after archiving", async () => {
    const other = await createCity();
    const id = await published();
    await activate();
    const initialCity = await city();
    const initialVenue = await document(id);
    await editVenue(id, { status: "archived" });
    await editCity(hazaribag, { status: "archived" });
    await expect(editVenue(id, { slug: "synthetic-replacement" })).rejects.toMatchObject({ code: "23514", message: "venue_url_locked" });
    await expect(editVenue(id, { city_id: other })).rejects.toMatchObject({ code: "23514", message: "venue_url_locked" });
    await expect(editCity(hazaribag, { slug: "synthetic-replacement-city" })).rejects.toMatchObject({ code: "23514", message: "city_slug_locked" });
    await rows("update shagun.venues set published_at = null, created_at = '1900-01-01', updated_at = '1900-01-01' where id = $1", [id]);
    await rows("update shagun.cities set launched_at = null, created_at = '1900-01-01', updated_at = '1900-01-01' where id = $1", [hazaribag]);
    expect((await document(id)).published_at).toBe(initialVenue.published_at);
    expect((await document(id)).created_at).toBe(initialVenue.created_at);
    expect((await city()).launched_at).toBe(initialCity.launched_at);
    expect((await city()).created_at).toBe(initialCity.created_at);
    await expect(rows("update shagun.venues set slug = 'synthetic-unlock-attempt', published_at = null where id = $1", [id])).rejects.toMatchObject({ code: "23514" });
    await expect(rows("update shagun.cities set slug = 'synthetic-unlock-attempt', launched_at = null where id = $1", [hazaribag])).rejects.toMatchObject({ code: "23514" });
  });

  it("allows draft URLs and city association to change before the first launch/publication", async () => {
    const other = await createCity();
    const id = await createVenue();
    await editVenue(id, { city_id: other, slug: "synthetic-prepublication-url" });
    await editCity(other, { slug: "synthetic-prelaunch-url" });
    expect((await document(id))).toMatchObject({ city_id: other, slug: "synthetic-prepublication-url", published_at: null });
    expect((await city(other))).toMatchObject({ slug: "synthetic-prelaunch-url", launched_at: null });
  });

  it("requires the exact old timestamp and rejects stale city and venue saves with P0001 conflict", async () => {
    const id = await createVenue();
    const oldVenue = await document(id);
    const oldCity = await city();
    await editVenue(id, { description: "Synthetic first edit" });
    await editCity(hazaribag, { description: "Synthetic first city edit" });
    for (const expected of [null, oldVenue.updated_at]) {
      await expect(editVenue(id, { description: "Synthetic stale edit" }, expected)).rejects.toMatchObject({ code: "P0001", message: "conflict" });
    }
    for (const expected of [null, oldCity.updated_at]) {
      await expect(editCity(hazaribag, { description: "Synthetic stale city edit" }, expected)).rejects.toMatchObject({ code: "P0001", message: "conflict" });
    }
    const current = await document(id);
    const exact = await value<string>("(select to_jsonb(v) ->> 'updated_at' from shagun.venues v where v.id = $1)", [id]);
    expect(current.updated_at).toBe(exact);
    await editVenue(id, { description: "Synthetic exact string edit" }, exact);
    expect((await document(id)).description).toBe("Synthetic exact string edit");
  });

  it("photo writes invalidate stale parent forms rather than overwrite concurrently changed snapshots", async () => {
    const id = await createVenue();
    const oldVenue = await document(id);
    const oldCity = await city();
    await photo({ venue_id: id });
    await photo({ city_id: hazaribag });
    await expect(editVenue(id, { facilities: ["ac"] }, oldVenue.updated_at)).rejects.toMatchObject({ code: "P0001", message: "conflict" });
    await expect(editCity(hazaribag, { description: "Synthetic stale city save" }, oldCity.updated_at)).rejects.toMatchObject({ code: "P0001", message: "conflict" });
    expect((await document(id)).photos).toHaveLength(1);
    expect((await document(id)).facilities).toEqual([]);
  });
});

describe("prefix search, comparable facts, pagination and real admin metrics", () => {
  async function inventory() {
    const lotus = await published({ name: "Synthetic Lotus Hall", locality: "Synthetic Bazaar", address: "123 Synthetic Orchard Road",
      capacity_max: 500, price_min: 10000, price_max: 20000, price_type: "per_day", facilities: ["ac", "parking"] });
    const river = await published({ name: "Synthetic River Hall", capacity_max: 1000, price_max: 30000, price_type: "per_day", facilities: ["parking"] });
    const plate = await published({ name: "Synthetic Plate Hall", venue_type: "hotel", capacity_min: 100,
      price_min: 700, price_type: "per_plate", facilities: ["rooms"] });
    await createVenue({ name: "Synthetic Hidden Draft", venue_type: "resort", facilities: ["lift"], capacity_max: 90000, price_type: "per_event", price_min: 1 });
    const other = await createCity();
    const otherVenue = await published({ name: "Synthetic Other City Hall", facilities: ["kitchen"] }, other);
    await activate();
    return { lotus, river, plate, other, otherVenue };
  }

  it("safely matches prefix tokens in name, locality, address, city name and state", async () => {
    const { lotus } = await inventory();
    for (const query of ["lot", "synthet lot", "baza", "orchar", "  lot  ", "lot | ' & :* "])
      expect((await search({ p_query: query })).items.map((v) => v.id)).toEqual([lotus]);
    for (const query of ["hazar", "jhark"])
      expect((await search({ p_query: query })).total).toBe(3);
    expect((await search({ p_query: "'); DROP TABLE venues; --" })).total).toBe(0);
    expect((await search({ p_query: "':* &|()" })).total).toBe(0);
    expect(await count("shagun.venues")).toBe(5);
    const cities = await rpc<CityResults>("public_cities", { p_query: "jhark" }, "anon", null);
    expect(cities.total).toBe(1);
    expect(cities.items[0].id).toBe(hazaribag);
    expect((await rpc<CityResults>("public_cities", { p_query: "synthetic" }, "anon", null)).total).toBe(0);
  }, 30_000); // Multiple RLS/full-text plans in WASM are slower than a native server.

  it("requires ALL facilities and capacity_max sufficient for the requested guests", async () => {
    const { lotus, river } = await inventory();
    expect((await search({ p_facilities: ["parking", "ac"] })).items.map((v) => v.id)).toEqual([lotus]);
    expect((await search({ p_facilities: ["ac", "rooms"] })).total).toBe(0);
    expect((await search({ p_facilities: ["ac", "ac"] })).total).toBe(1);
    expect((await search({ p_capacity: 501 })).items.map((v) => v.id)).toEqual([river]);
    expect((await search({ p_capacity: 500 })).total).toBe(2);
    expect((await search({ p_capacity: 1 })).total).toBe(2); // A minimum alone cannot promise a maximum capacity.
  });

  it("does not compare per-plate and per-day pricing, and uses a recorded maximum when no minimum exists", async () => {
    const { lotus, river, plate } = await inventory();
    expect((await search({ p_budget: 15000, p_price_type: "per_day" })).items.map((v) => v.id)).toEqual([lotus]);
    expect((await search({ p_budget: 1000, p_price_type: "per_plate" })).items.map((v) => v.id)).toEqual([plate]);
    const daily = await search({ p_budget: 30000, p_price_type: "per_day", p_sort: "price" });
    expect(daily.items.map((v) => v.id)).toEqual([lotus, river]);
    expect((await search({ p_budget: 29999, p_price_type: "per_day" })).total).toBe(1);
    await expect(search({ p_budget: 1000 })).rejects.toMatchObject({ code: "22023" });
    await expect(search({ p_sort: "price" })).rejects.toMatchObject({ code: "22023" });
  });

  it("returns only published active positive facets, even to admins", async () => {
    const { other } = await inventory();
    for (const [role, user] of [["anon", null], ["authenticated", ADMIN]] as const) {
      expect(await rpc<Facets>("city_facets", { p_city: hazaribag }, role, user)).toEqual({
        facilities: ["ac", "parking", "rooms"], venueTypes: ["hotel", "vivah_bhawan"], hasCapacity: true, priceTypes: ["per_day", "per_plate"],
      });
      expect(await rpc("city_facets", { p_city: other }, role, user)).toEqual({ facilities: [], venueTypes: [], hasCapacity: false, priceTypes: [] });
      expect(await rpc("city_facets", { p_city: MISSING }, role, user)).toEqual({ facilities: [], venueTypes: [], hasCapacity: false, priceTypes: [] });
    }
    const noFacts = await published({ price_type: "per_event" });
    expect((await rpc<Facets>("city_facets", { p_city: hazaribag }, "anon", null)).priceTypes).not.toContain("per_event");
    expect((await document(noFacts)).price_min).toBeNull();
  });

  it("discovers an admin-created second city without geographic special cases", async () => {
    const { other, otherVenue } = await inventory();
    await activate(other);
    const found = await search({ p_query: "synthetic test state", p_city: other });
    expect(found.items.map((v) => v.id)).toEqual([otherVenue]);
    expect(found.items[0].city.slug).toBe("synthetic-river-city");
    expect((await rpc<CityResults>("public_cities", {}, "anon", null)).total).toBe(2);
    expect((await rpc<CityResults>("public_cities", { p_query: "riv", p_page: 1, p_limit: 1 }, "anon", null)).items[0].id).toBe(other);
  });

  it("uses deterministic ID ties, nulls-last fact sorts, bounded pages and identical counts", async () => {
    const { lotus, river, plate } = await inventory();
    const unknown = await published({ name: "Synthetic Unknown Price", price_type: "per_day" });
    const prices = await search({ p_price_type: "per_day", p_sort: "price" });
    expect(prices.items.map((v) => v.id)).toEqual([lotus, river, unknown]);
    const capacity = await search({ p_sort: "capacity" });
    expect(capacity.items.slice(0, 2).map((v) => v.id)).toEqual([lotus, river]);
    expect(capacity.items.slice(2).map((v) => v.id)).toEqual([plate, unknown].sort());
    // One SQL statement gives every row the same transaction timestamp.
    await rows("update shagun.venues set updated_at = transaction_timestamp()");
    const first = await search({ p_sort: "recent", p_page: 1, p_limit: 2 });
    const second = await search({ p_sort: "recent", p_page: 2, p_limit: 2 });
    expect([...first.items, ...second.items].map((v) => v.id)).toEqual([lotus, river, plate, unknown].sort());
    expect(first).toMatchObject({ total: 4, page: 1, pageSize: 2 });
    expect(second).toMatchObject({ total: 4, page: 2, pageSize: 2 });
    expect(await search({ p_sort: "recent", p_page: 1, p_limit: 2 })).toEqual(first);
    expect(await search({ p_page: 1000, p_limit: 25 })).toEqual({ items: [], total: 4, page: 1000, pageSize: 25 });
    const filterPage = await search({ p_facilities: ["parking"], p_page: 2, p_limit: 1 });
    expect(filterPage).toMatchObject({ total: 2, page: 2, pageSize: 1 });
    expect(filterPage.items).toHaveLength(1);
  });

  it.each([
    { p_query: "x".repeat(101) }, { p_query: null }, { p_page: 0 }, { p_page: 1001 }, { p_page: null },
    { p_limit: 0 }, { p_limit: 26 }, { p_capacity: 0 }, { p_capacity: 100001 }, { p_budget: -1, p_price_type: "per_day" },
    { p_price_type: "per_guest" }, { p_type: "palace" }, { p_sort: "popularity" }, { p_facilities: ["unknown"] },
    { p_facilities: [null] }, { p_facilities: Array(10).fill("ac") }, { p_facilities: null },
  ])("rejects malformed unbounded search parameters %j", async (args) => {
    await expect(search(args)).rejects.toMatchObject({ code: "22023" });
  });

  it("uses exact DashboardData metrics, includes cleanup, and excludes archived rows from recheck", async () => {
    const recentDate = new Date(Date.now() - 86_400_000).toISOString();
    await published({ verification_status: "verified", verified_at: recentDate });
    const unverified = await published();
    const draft = await createVenue();
    const stale = await createVenue({ status: "unpublished", verification_status: "verified", verified_at: "2020-01-01", reviewed: true });
    await createVenue({ status: "archived" });
    await createCity();
    await activate();
    const asset = await photo({ venue_id: draft });
    await rows("delete from shagun.media_assets where id = $1", [asset.id]);
    const dashboard = await rpc<DashboardData>("admin_dashboard");
    expect(Object.keys(dashboard).sort()).toEqual(["totalCities", "activeCities", "totalVenues", "publishedVenues", "draftVenues", "reviewVenues", "cities", "recentVenues", "cleanupCount"].sort());
    expect(dashboard).toMatchObject({ totalCities: 2, activeCities: 1, totalVenues: 5, publishedVenues: 2, draftVenues: 1, reviewVenues: 3, cleanupCount: 1 });
    expect(dashboard.cities.find((c) => c.id === hazaribag)).toMatchObject({ total_count: 5, published_count: 2, draft_count: 1, review_count: 3 });
    expect(dashboard.cities.find((c) => c.id !== hazaribag)).toMatchObject({ total_count: 0, published_count: 0, draft_count: 0, review_count: 0 });
    const queue = await rpc<SearchResult>("admin_venues", { p_status: "needs_review" });
    expect(queue.total).toBe(3);
    expect(queue.pageSize).toBe(25);
    expect(queue.items.map((v) => v.id).sort()).toEqual([unverified, draft, stale].sort());
    expect(JSON.stringify(dashboard)).not.toContain("source_notes");
    const publicSummary = (await rpc<CityResults>("public_cities", {}, "authenticated", ADMIN)).items[0];
    expect(publicSummary).toMatchObject({ total_count: 2, published_count: 2, draft_count: 0, review_count: 0 });
  });

  it("limits recent venues to eight and returns real paginated admin city/status/query results", async () => {
    const ids = [];
    for (let i = 0; i < 10; i++) ids.push(await createVenue({ name: `Synthetic Recent Venue ${i}` }));
    const other = await createCity();
    const dashboard = await rpc<DashboardData>("admin_dashboard");
    expect(dashboard.totalVenues).toBe(10);
    expect(dashboard.recentVenues.map((v) => v.id)).toEqual(ids.slice(2).reverse());
    expect(dashboard.cities).toHaveLength(2);
    const summaries = await rpc<CityResults>("admin_city_summaries", { p_query: "river", p_page: 1, p_limit: 1 });
    expect(summaries.total).toBe(1);
    expect(summaries.items[0].id).toBe(other);
    expect((await rpc<CityResults>("admin_city_summaries", { p_page: 2, p_limit: 1 })).items).toHaveLength(1);
    expect((await rpc<SearchResult>("admin_venues", { p_city: hazaribag, p_query: "rec", p_status: "draft" })).total).toBe(10);
    expect((await rpc<SearchResult>("admin_venues", { p_query: "jhark" })).total).toBe(10);
    expect((await rpc<SearchResult>("admin_venues", { p_city: other })).total).toBe(0);
    expect((await rpc<SearchResult>("admin_venues", { p_page: 2 })).items).toEqual([]);
    await expect(rpc("admin_venues", { p_status: "invalid" })).rejects.toMatchObject({ code: "22023" });
    await expect(rpc("admin_city_summaries", { p_limit: 26 })).rejects.toMatchObject({ code: "22023" });
    await expect(rpc("public_cities", { p_query: "x".repeat(101) }, "anon", null)).rejects.toMatchObject({ code: "22023" });
  });
});

describe("bounded public sitemap partitions", () => {
  async function publicRoutes() {
    // Deliberately insert in a different order from the canonical path order.
    await published({ slug: "synthetic-zulu" });
    await published({ slug: "synthetic-alpha" });
    await activate();
    const other = await createCity({ slug: "aaa-synthetic-city" });
    await published({ slug: "synthetic-other" }, other);
    await activate(other);
    return [
      "/city/aaa-synthetic-city", "/city/aaa-synthetic-city/vivah-bhawan/synthetic-other",
      "/city/hazaribag", "/city/hazaribag/vivah-bhawan/synthetic-alpha", "/city/hazaribag/vivah-bhawan/synthetic-zulu",
    ];
  }

  it("returns empty items and a zero count before any city launches", async () => {
    await published(); // Publication alone is not a public route in a draft city.
    expect(await rpc("sitemap_entries", {}, "anon", null)).toEqual({ total: 0, items: [] });
    expect(await rpc("sitemap_entries", { p_offset: 0, p_limit: 0 }, "anon", null)).toEqual({ total: 0, items: [] });
  });

  it("includes only nonempty active cities and their published venues, even for admin and BYPASSRLS callers", async () => {
    const paths = await publicRoutes();
    for (const status of ["draft", "unpublished", "archived"]) await createVenue({ status, slug: `synthetic-hidden-${status}` });
    for (const status of ["draft", "inactive", "archived"]) {
      const hiddenCity = await createCity({ status, slug: `synthetic-hidden-city-${status}` });
      await published({ slug: "synthetic-hidden-published" }, hiddenCity);
    }
    const emptyCity = await createCity({ slug: "synthetic-empty-active-city" });
    const formerlyPublic = await published({}, emptyCity);
    await activate(emptyCity);
    await editVenue(formerlyPublic, { status: "unpublished" });
    expect((await city(emptyCity)).status).toBe("active");

    for (const [role, user] of [["anon", null], ["authenticated", STRANGER], ["authenticated", ADMIN], ["service_role", null]] as const) {
      const result = await rpc<SitemapResults>("sitemap_entries", {}, role, user);
      expect(result.total).toBe(paths.length);
      expect(result.items.map((entry) => entry.path)).toEqual(paths);
      expect(Object.keys(result).sort()).toEqual(["items", "total"]);
      for (const entry of result.items) {
        expect(Object.keys(entry).sort()).toEqual(["path", "updatedAt"]);
        expect(Number.isFinite(Date.parse(entry.updatedAt))).toBe(true);
      }
      expect(await rpc("sitemap_entries", { p_offset: 0, p_limit: 0 }, role, user)).toEqual({ total: paths.length, items: [] });
    }
  });

  it("uses stable sorted bounded pages, unchanged totals and zero-limit count-only requests", async () => {
    const paths = await publicRoutes();
    const all = await rpc<SitemapResults>("sitemap_entries", { p_offset: 0, p_limit: 10000 }, "anon", null);
    expect(all.items.map((entry) => entry.path)).toEqual(paths);
    const collected: SitemapResults["items"] = [];
    for (const offset of [0, 2, 4]) {
      const args = { p_offset: offset, p_limit: 2 };
      const page = await rpc<SitemapResults>("sitemap_entries", args, "anon", null);
      expect(page.total).toBe(paths.length);
      expect(page.items.length).toBeLessThanOrEqual(2);
      expect(page.items).toEqual(all.items.slice(offset, offset + 2));
      expect(await rpc("sitemap_entries", args, "anon", null)).toEqual(page);
      collected.push(...page.items);
    }
    expect(collected).toEqual(all.items);
    for (const offset of [0, 2, 10000000]) {
      expect(await rpc("sitemap_entries", { p_offset: offset, p_limit: 0 }, "anon", null)).toEqual({ total: paths.length, items: [] });
    }
    for (const offset of [paths.length, 10000000]) {
      expect(await rpc("sitemap_entries", { p_offset: offset, p_limit: 10000 }, "anon", null)).toEqual({ total: paths.length, items: [] });
    }
  });

  it.each([
    { p_offset: -1 }, { p_offset: 10000001 }, { p_limit: -1 }, { p_limit: 10001 },
    { p_offset: null }, { p_limit: null }, { p_offset: null, p_limit: null },
  ])("rejects null or out-of-bounds sitemap pagination %j", async (args) => {
    await expect(rpc("sitemap_entries", args, "anon", null)).rejects.toMatchObject({ code: "22023", message: "invalid_page" });
  });
});

describe("media identity, covers, deterministic ordering and durable deletion", () => {
  it("chooses the first upload as cover and serializes a new cover without a unique-index race", async () => {
    const id = await createVenue();
    const first = await photo({ venue_id: id });
    const second = await photo({ venue_id: id });
    const third = await photo({ venue_id: id }, { is_cover: true });
    expect(first.is_cover).toBe(true);
    expect(second.is_cover).toBe(false);
    expect(third.sort_order).toBe(2);
    expect((await document(id)).photos.map((p) => p.id)).toEqual([third.id, first.id, second.id]);
    await rpc("update_photo", { p_id: second.id, p_operation: "cover" });
    const images = (await document(id)).photos;
    expect(images.filter((p) => p.is_cover).map((p) => p.id)).toEqual([second.id]);
    expect(images[0].id).toBe(second.id);
    await rows("delete from shagun.media_assets where id = $1", [second.id]);
    expect((await document(id)).photos[0]).toMatchObject({ id: first.id, is_cover: true });
    expect(await count("shagun.storage_cleanup_jobs")).toBe(1);
  });

  it("normalizes duplicate/gapped order with ID ties, swaps adjacent photos and preserves cover-first JSON", async () => {
    const id = await createVenue();
    const first = await photo({ venue_id: id }, { id: "20000000-0000-4000-8000-000000000001" });
    const second = await photo({ venue_id: id }, { id: "20000000-0000-4000-8000-000000000002" });
    const third = await photo({ venue_id: id }, { id: "20000000-0000-4000-8000-000000000003" });
    await rows("update shagun.media_assets set sort_order = 99 where venue_id = $1", [id]);
    await rpc("update_photo", { p_id: third.id, p_operation: "up" });
    const ordered = await rows<{ id: string; sort_order: number }>("select id, sort_order from shagun.media_assets where venue_id = $1 order by sort_order, id", [id]);
    expect(ordered).toEqual([{ id: first.id, sort_order: 0 }, { id: third.id, sort_order: 1 }, { id: second.id, sort_order: 2 }]);
    await rpc("update_photo", { p_id: third.id, p_operation: "down" });
    await rpc("update_photo", { p_id: first.id, p_operation: "up" }); // Boundary is a safe no-op.
    await rpc("update_photo", { p_id: third.id, p_operation: "down" });
    expect((await document(id)).photos.map((p) => p.id)).toEqual([first.id, second.id, third.id]);
    await rpc("update_photo", { p_id: third.id, p_operation: "cover" });
    expect((await document(id)).photos.map((p) => p.id)).toEqual([third.id, first.id, second.id]);
    await expect(rows("update shagun.media_assets set sort_order = -1 where id = $1", [first.id])).rejects.toMatchObject({ code: "23514" });
    await expect(rows("update shagun.media_assets set sort_order = 'NaN' where id = $1", [first.id])).rejects.toMatchObject({ code: "22P02" });
  });

  it("touches parent versions on metadata, cover and deletion; edits never change identity or created_at", async () => {
    const id = await createVenue();
    const image = await photo({ venue_id: id });
    const old = await document(id);
    await rpc("update_photo", { p_id: image.id, p_operation: "metadata", p_alt: "Synthetic revised accessible alt", p_credit: "Synthetic revised rights confirmation" });
    const changed = await document(id);
    expect(changed.updated_at).not.toBe(old.updated_at);
    expect(changed.photos[0]).toMatchObject({ storage_key: image.storage_key, created_at: image.created_at, alt_text: "Synthetic revised accessible alt" });
    await rows("delete from shagun.media_assets where id = $1", [image.id]);
    expect((await document(id)).updated_at).not.toBe(changed.updated_at);
    expect((await document(id)).photos).toEqual([]);
    const cityPhoto = await photo({ city_id: hazaribag });
    const previousCity = await city();
    await rpc("update_photo", { p_id: cityPhoto.id, p_operation: "metadata", p_alt: "Synthetic city accessible alt", p_credit: "Synthetic city rights confirmation" });
    expect((await city()).updated_at).not.toBe(previousCity.updated_at);
    await expect(rpc("update_photo", { p_id: MISSING, p_operation: "cover" })).rejects.toMatchObject({ code: "P0002" });
    await expect(rpc("update_photo", { p_id: cityPhoto.id, p_operation: "random" })).rejects.toMatchObject({ code: "22023" });
    await expect(rpc("update_photo", { p_id: cityPhoto.id, p_operation: "metadata", p_alt: "bad", p_credit: "bad" })).rejects.toMatchObject({ code: "23514" });
  });

  it.each([
    ["neither owner", { venue_id: null, city_id: null }, "23514"], ["both owners", { city_id: "use-city" }, "23514"],
    ["path traversal", { storage_key: "../synthetic/480.webp" }, "23514"], ["non-UUID key", { storage_key: "synthetic-image" }, "23514"],
    ["missing rights", { credit: null }, "23502"], ["blank rights", { credit: " " }, "23514"], ["short alt", { alt_text: "bad" }, "23514"],
    ["zero width", { width: 0 }, "23514"], ["excess height", { height: 20001 }, "23514"], ["unknown owner", { venue_id: MISSING }, "23503"],
  ])("rejects invalid media %s", async (_label, overrides, code) => {
    const id = await createVenue();
    const invalid = { ...overrides } as Inputs;
    if (invalid.city_id === "use-city") invalid.city_id = hazaribag;
    await expect(photo({ venue_id: id }, invalid)).rejects.toMatchObject({ code });
    expect(await count("shagun.media_assets")).toBe(0);
  });

  it("enforces 24 venue photos, one city photo, unique UUID roots and immutable owners/storage keys", async () => {
    const id = await createVenue();
    const otherVenue = await createVenue();
    const first = await photo({ venue_id: id });
    await expect(photo({ venue_id: id }, { storage_key: first.storage_key })).rejects.toMatchObject({ code: "23505" });
    for (let i = 1; i < 24; i++) await photo({ venue_id: id });
    await expect(photo({ venue_id: id })).rejects.toMatchObject({ code: "23514", message: "photo_limit" });
    await photo({ city_id: hazaribag });
    await expect(photo({ city_id: hazaribag })).rejects.toMatchObject({ code: "23514", message: "photo_limit" });
    await expect(rows("update shagun.media_assets set venue_id = $2 where id = $1", [first.id, otherVenue])).rejects.toMatchObject({ code: "23514" });
    await expect(rows("update shagun.media_assets set storage_key = $2 where id = $1", [first.id, randomUUID()])).rejects.toMatchObject({ code: "23514" });
    await rows("delete from shagun.media_assets where id = $1", [first.id]);
    await expect(photo({ venue_id: otherVenue }, { storage_key: first.storage_key })).rejects.toMatchObject({ code: "23514", message: "storage_key_pending_cleanup" });
  });

  it("requires exact name/version and unpublished state for permanent deletion", async () => {
    const id = await published();
    await activate();
    await expect(remove("venue", id)).rejects.toMatchObject({ code: "23514" });
    await expect(remove("city", hazaribag)).rejects.toMatchObject({ code: "23514" });
    await expect(rows("delete from shagun.venues where id = $1", [id])).rejects.toMatchObject({ code: "23514" });
    await expect(rows("delete from shagun.cities where id = $1", [hazaribag])).rejects.toMatchObject({ code: "23514" });
    await editVenue(id, { status: "unpublished" });
    await expect(remove("venue", id, { p_name: (await document(id)).name.toUpperCase() })).rejects.toMatchObject({ code: "23514", message: "name_mismatch" });
    const stale = await document(id);
    await photo({ venue_id: id });
    await expect(remove("venue", id, { p_expected: stale.updated_at })).rejects.toMatchObject({ code: "P0001", message: "conflict" });
    await expect(remove("venue", id, { p_expected: null })).rejects.toMatchObject({ code: "P0001" });
    await editCity(hazaribag, { status: "inactive" });
    await expect(remove("city", hazaribag)).rejects.toMatchObject({ code: "23001" }); // ON DELETE RESTRICT, not a missing FK target.
    await remove("venue", id);
    await remove("city", hazaribag);
    expect(await count("shagun.cities")).toBe(0);
  });

  it("cascades private research/facilities/media and queues every deleted root transactionally", async () => {
    const id = await createVenue({ facilities: ["ac", "parking"] });
    const images = [await photo({ venue_id: id }), await photo({ venue_id: id }), await photo({ venue_id: id })];
    const cityImage = await photo({ city_id: hazaribag });
    await remove("venue", id);
    for (const table of ["venues", "venue_research", "venue_facilities"]) expect(await count(`shagun.${table}`)).toBe(0);
    expect(await count("shagun.media_assets")).toBe(1);
    await remove("city", hazaribag);
    expect(await count("shagun.media_assets")).toBe(0);
    const jobs = await rows<{ storage_key: string }>("select storage_key from shagun.storage_cleanup_jobs order by storage_key");
    expect(jobs.map((j) => j.storage_key)).toEqual([...images, cityImage].map((p) => p.storage_key).sort());
    expect((await rpc<DashboardData>("admin_dashboard")).cleanupCount).toBe(4);
    await expect(rows("insert into shagun.storage_cleanup_jobs (storage_key) values ($1)", [randomUUID()])).rejects.toMatchObject({ code: "42501" });
    expect(await count("shagun.storage_cleanup_jobs", "authenticated", STRANGER)).toBe(0);
    await rows("delete from shagun.storage_cleanup_jobs where storage_key = $1", [images[0].storage_key]);
    expect(await count("shagun.storage_cleanup_jobs")).toBe(3);
  });

  it("never queues or loses media if a deletion transaction rolls back", async () => {
    const id = await createVenue();
    await photo({ venue_id: id });
    await db.exec("begin; set local role authenticated");
    try {
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [ADMIN]);
      await db.query("delete from shagun.venues where id = $1", [id]);
      const pending = await db.query<{ n: number }>("select count(*)::integer as n from shagun.storage_cleanup_jobs");
      expect(pending.rows[0].n).toBe(1);
    } finally { await db.exec("rollback"); }
    expect(await count("shagun.storage_cleanup_jobs")).toBe(0);
    expect((await document(id)).photos).toHaveLength(1);
  });
});

describe("durable bounded pre-upload reservations under real roles", () => {
  it("permits invoker row locking without allowing reservation inserts, deadline edits or ID edits", async () => {
    const functions = await rows<{ proname: string; prosecdef: boolean }>(`select proname, prosecdef from pg_proc
      where pronamespace = 'shagun'::regnamespace and proname in ('begin_media_upload', 'finalize_media_upload') order by proname`);
    expect(functions).toEqual([{ proname: "begin_media_upload", prosecdef: true }, { proname: "finalize_media_upload", prosecdef: false }]);
    const indexes = await rows<{ indexdef: string }>("select indexdef from pg_indexes where schemaname = 'shagun' and indexname = 'storage_cleanup_ready_idx'");
    expect(indexes[0].indexdef).toContain("(ready_at, id)");
    const reservation = await reserveUpload();
    expect(await rows("select id from shagun.storage_cleanup_jobs where id = $1 for update", [reservation.id])).toEqual([{ id: reservation.id }]);
    await expect(rows("insert into shagun.storage_cleanup_jobs (storage_key) values ($1)", [randomUUID()])).rejects.toMatchObject({ code: "42501" });
    await expect(rows("update shagun.storage_cleanup_jobs set ready_at = transaction_timestamp() where id = $1", [reservation.id])).rejects.toMatchObject({ code: "42501" });
    await expect(rows("update shagun.storage_cleanup_jobs set created_at = transaction_timestamp() where id = $1", [reservation.id])).rejects.toMatchObject({ code: "42501" });
    // UPDATE(id) exists solely for row locking; even an unchanged ID fails RLS.
    await expect(rows("update shagun.storage_cleanup_jobs set id = id where id = $1", [reservation.id])).rejects.toMatchObject({ code: "42501" });
    expect(await cleanupJob(reservation.storage_key)).toEqual(reservation);
  });

  it("exposes both RPCs only to authenticated active admins, not anon, service, strangers or inactive members", async () => {
    const id = await createVenue();
    const reservation = await reserveUpload();
    const args = { p_data: JSON.stringify(uploadInput(reservation.storage_key, { venue_id: id })) };
    for (const [role, user] of [["anon", null], ["anon", ADMIN], ["service_role", null], ["service_role", ADMIN]] as const) {
      await expect(rpc("begin_media_upload", { p_key: randomUUID() }, role, user)).rejects.toMatchObject({ code: "42501" });
      await expect(rpc("finalize_media_upload", args, role, user)).rejects.toMatchObject({ code: "42501" });
    }
    for (const user of [STRANGER, INACTIVE_ADMIN, null]) {
      await expect(rpc("begin_media_upload", { p_key: randomUUID() }, "authenticated", user)).rejects.toMatchObject({ code: "42501", message: "admin_required" });
      await expect(rpc("finalize_media_upload", args, "authenticated", user)).rejects.toMatchObject({ code: "42501", message: "admin_required" });
      expect(await count("shagun.storage_cleanup_jobs", "authenticated", user)).toBe(0);
    }
    await expect(count("shagun.storage_cleanup_jobs", "anon", null)).rejects.toMatchObject({ code: "42501" });
    expect(await cleanupJob(reservation.storage_key)).toEqual(reservation);
    expect(await count("shagun.media_assets")).toBe(0);
  });

  it("rechecks a revoked uploader's membership and permits another current trusted admin to finalize", async () => {
    const id = await createVenue();
    const reservation = await reserveUpload();
    const args = { p_data: JSON.stringify(uploadInput(reservation.storage_key, { venue_id: id })) };
    await rows("update shagun.admin_users set is_active = false where id = $1", [ADMIN], "service_role", null);
    await expect(rpc("begin_media_upload", { p_key: randomUUID() })).rejects.toMatchObject({ code: "42501", message: "admin_required" });
    await expect(rpc("finalize_media_upload", args)).rejects.toMatchObject({ code: "42501", message: "admin_required" });
    expect(await cleanupJob(reservation.storage_key)).toBeNull();
    expect(await cleanupJob(reservation.storage_key, "authenticated", SECOND_ADMIN)).toEqual(reservation);
    expect(await rpc("finalize_media_upload", args, "authenticated", SECOND_ADMIN)).toMatchObject({ venue_id: id, storage_key: reservation.storage_key });
    expect(await cleanupJob(reservation.storage_key, "authenticated", SECOND_ADMIN)).toBeNull();
  });

  it("commits a 15-minute cleanup reservation before any Storage writes and retains it after an interrupted partial upload", async () => {
    const id = await createVenue();
    const reservation = await reserveUpload(); // RPC and following probes are separate committed transactions.
    expect(Date.parse(reservation.ready_at) - Date.parse(reservation.created_at)).toBe(15 * 60 * 1000);
    expect(await count("shagun.media_assets")).toBe(0);
    expect(await count("storage.objects")).toBe(0);
    expect(await rows("select id from shagun.storage_cleanup_jobs where ready_at <= transaction_timestamp() order by ready_at, id limit 25")).toEqual([]);
    await expect(photo({ venue_id: id }, { storage_key: reservation.storage_key })).rejects.toMatchObject({ code: "23514", message: "storage_key_pending_cleanup" });
    for (const width of [480, 960]) {
      await rows("insert into storage.objects (bucket_id, name) values ('shagun-media', $1)", [`${reservation.storage_key}/${width}.webp`]);
    }
    // Simulate the process stopping before the third variant/finalization: no catch-based cleanup.
    expect(await count("storage.objects")).toBe(2);
    expect(await count("storage.objects", "anon", null)).toBe(0);
    expect(await count("shagun.media_assets")).toBe(0);
    expect(await cleanupJob(reservation.storage_key)).toEqual(reservation);
    expect(await rows("select id from shagun.storage_cleanup_jobs where ready_at <= transaction_timestamp() order by ready_at, id limit 25")).toEqual([]);
  });

  it("cannot reserve an existing media root or renew an existing cleanup reservation", async () => {
    const id = await createVenue();
    const image = await photo({ venue_id: id });
    await expect(rpc("begin_media_upload", { p_key: image.storage_key })).rejects.toMatchObject({ code: "23514", message: "storage_key_in_use" });
    expect(await count("shagun.storage_cleanup_jobs")).toBe(0);
    const reservation = await reserveUpload();
    await expect(rpc("begin_media_upload", { p_key: reservation.storage_key })).rejects.toMatchObject({ code: "23505" });
    expect(await cleanupJob(reservation.storage_key)).toEqual(reservation);
    await rows("delete from shagun.media_assets where id = $1", [image.id]);
    const deletion = await cleanupJob(image.storage_key);
    await expect(rpc("begin_media_upload", { p_key: image.storage_key })).rejects.toMatchObject({ code: "23505" });
    expect(await cleanupJob(image.storage_key)).toEqual(deletion);
  });

  it.each([null, "", "../synthetic", `${MISSING}/480.webp`, ` ${MISSING}`, MISSING.toUpperCase(),
    "ffffffff-ffff-1fff-8fff-ffffffffffff", "ffffffff-ffff-4fff-7fff-ffffffffffff"])
    ("rejects a noncanonical UUIDv4 reservation key %s", async (key) => {
      await expect(rpc("begin_media_upload", { p_key: key })).rejects.toMatchObject({ code: "22023", message: "invalid_storage_key" });
      expect(await count("shagun.storage_cleanup_jobs")).toBe(0);
    });

  it("consumes a reservation atomically and accepts only photo metadata, not IDs, audit stamps, ordering or cover input", async () => {
    const id = await createVenue();
    const before = await document(id);
    const firstJob = await reserveUpload();
    const first = await finalizeUpload(firstJob.storage_key, { venue_id: id }, {
      id: MISSING, created_at: "invalid", updated_at: "invalid", sort_order: -100, is_cover: false,
      alt_text: "  Synthetic reserved accessible alt  ", credit: "  Synthetic confirmed upload rights  ",
    });
    expect(first).toMatchObject({ venue_id: id, city_id: null, storage_key: firstJob.storage_key, sort_order: 0, is_cover: true,
      width: 1600, height: 900, alt_text: "Synthetic reserved accessible alt", credit: "Synthetic confirmed upload rights" });
    expect(first.id).not.toBe(MISSING);
    expect(Number.isFinite(Date.parse(first.created_at))).toBe(true);
    expect(Object.keys(first).sort()).toEqual(["id", "venue_id", "city_id", "storage_key", "alt_text", "credit", "width", "height", "sort_order", "is_cover", "created_at"].sort());
    expect(await cleanupJob(firstJob.storage_key)).toBeNull();
    expect((await document(id)).updated_at).not.toBe(before.updated_at);
    const secondJob = await reserveUpload();
    const second = await finalizeUpload(secondJob.storage_key, { venue_id: id }, { id: "invalid-id", created_at: "invalid", sort_order: "invalid-order", is_cover: true });
    expect(second).toMatchObject({ sort_order: 1, is_cover: false });
    expect((await document(id)).photos).toEqual([first, second]);
    expect(await count("shagun.storage_cleanup_jobs")).toBe(0);
    // SQL deliberately creates metadata only. Actual Storage HTTP verification is the route's responsibility.
    expect(await count("storage.objects")).toBe(0);
  });

  it("cannot finalize a missing or already consumed reservation, or finalize the same key twice", async () => {
    const id = await createVenue();
    await expect(finalizeUpload(randomUUID(), { venue_id: id })).rejects.toMatchObject({ code: "P0001", message: "upload_expired" });
    const reservation = await reserveUpload();
    const saved = await finalizeUpload(reservation.storage_key, { venue_id: id });
    await expect(finalizeUpload(reservation.storage_key, { venue_id: id }, { alt_text: "Synthetic replay attempt" }))
      .rejects.toMatchObject({ code: "P0001", message: "upload_expired" });
    expect((await document(id)).photos).toEqual([saved]);
    expect(await count("shagun.storage_cleanup_jobs")).toBe(0);
  });

  it.each([null, "null", "[]", '"synthetic"', "true", "42"])("requires a JSON object without consuming a reservation: %s", async (data) => {
    const reservation = await reserveUpload();
    await expect(rpc("finalize_media_upload", { p_data: data })).rejects.toMatchObject({ code: "22023", message: "object_required" });
    expect(await cleanupJob(reservation.storage_key)).toEqual(reservation);
    expect(await count("shagun.media_assets")).toBe(0);
  });

  it.each([
    ["neither owner", { venue_id: null }, "23514"], ["both owners", { city_id: "use-city" }, "23514"],
    ["unknown owner", { venue_id: MISSING }, "23503"], ["malformed owner", { venue_id: "invalid-uuid" }, "22P02"],
    ["missing rights", { credit: null }, "23502"], ["short alt", { alt_text: "bad" }, "23514"],
    ["zero width", { width: 0 }, "23514"], ["excess height", { height: 20001 }, "23514"],
    ["invalid dimension", { width: "invalid-width" }, "22P02"],
  ] satisfies Array<[string, Inputs, string]>)("rolls the reservation deletion back on invalid metadata: %s", async (_label, changes, code) => {
    const id = await createVenue();
    const before = await document(id);
    const reservation = await reserveUpload();
    const invalid: Inputs = { ...changes };
    if (invalid.city_id === "use-city") invalid.city_id = hazaribag;
    await expect(finalizeUpload(reservation.storage_key, { venue_id: id }, invalid)).rejects.toMatchObject({ code });
    expect(await cleanupJob(reservation.storage_key)).toEqual(reservation);
    expect(await document(id)).toEqual(before);
    expect(await count("shagun.media_assets")).toBe(0);
    expect(await finalizeUpload(reservation.storage_key, { venue_id: id })).toMatchObject({ venue_id: id, storage_key: reservation.storage_key });
    expect(await cleanupJob(reservation.storage_key)).toBeNull();
  });

  it.each([0, 1])("cannot finalize or renew an expired reservation (%i minutes past the deadline)", async (minutes) => {
    const id = await createVenue();
    const reservation = await reserveUpload();
    // Fixture clock advancement only; operators cannot change these columns.
    await rows(`update shagun.storage_cleanup_jobs set created_at = transaction_timestamp() - interval '16 minutes',
      ready_at = transaction_timestamp() - $2::integer * interval '1 minute' where id = $1`, [reservation.id, minutes], "service_role", null);
    const expired = await cleanupJob(reservation.storage_key);
    await expect(finalizeUpload(reservation.storage_key, { venue_id: id })).rejects.toMatchObject({ code: "P0001", message: "upload_expired" });
    await expect(rpc("begin_media_upload", { p_key: reservation.storage_key })).rejects.toMatchObject({ code: "23505" });
    expect(await cleanupJob(reservation.storage_key)).toEqual(expired);
    expect(await rows("select id from shagun.storage_cleanup_jobs where ready_at <= transaction_timestamp() order by ready_at, id limit 25")).toEqual([{ id: reservation.id }]);
    expect(await count("shagun.media_assets")).toBe(0);
  });

  it("keeps real deletion jobs immediately ready and never treats them as uploads, even with future equal timestamps", async () => {
    const id = await createVenue();
    const image = await photo({ venue_id: id });
    await rows("delete from shagun.media_assets where id = $1", [image.id]);
    const job = await cleanupJob(image.storage_key);
    expect(job).not.toBeNull();
    expect(job?.ready_at).toBe(job?.created_at);
    expect(await rows("select storage_key from shagun.storage_cleanup_jobs where ready_at <= transaction_timestamp() order by ready_at, id limit 25")).toEqual([{ storage_key: image.storage_key }]);
    await expect(finalizeUpload(image.storage_key, { venue_id: id })).rejects.toMatchObject({ code: "P0001", message: "upload_expired" });
    // Test the deletion-job discriminator independently of the wall-clock check.
    await rows(`update shagun.storage_cleanup_jobs set created_at = transaction_timestamp() + interval '1 hour',
      ready_at = transaction_timestamp() + interval '1 hour' where storage_key = $1`, [image.storage_key], "service_role", null);
    const futureDeletion = await cleanupJob(image.storage_key);
    await expect(finalizeUpload(image.storage_key, { venue_id: id })).rejects.toMatchObject({ code: "P0001", message: "upload_expired" });
    expect(await cleanupJob(image.storage_key)).toEqual(futureDeletion);
    expect(await count("shagun.media_assets")).toBe(0);
  });

  it("retains reservations when finalization would exceed 24 venue photos or one city photo", async () => {
    const id = await createVenue();
    for (let i = 0; i < 23; i++) await photo({ venue_id: id });
    const last = await reserveUpload();
    expect(await finalizeUpload(last.storage_key, { venue_id: id })).toMatchObject({ sort_order: 23, is_cover: false });
    const excessVenue = await reserveUpload();
    await expect(finalizeUpload(excessVenue.storage_key, { venue_id: id })).rejects.toMatchObject({ code: "23514", message: "photo_limit" });
    expect(await cleanupJob(excessVenue.storage_key)).toEqual(excessVenue);
    expect((await document(id)).photos).toHaveLength(24);
    const firstCity = await reserveUpload();
    expect(await finalizeUpload(firstCity.storage_key, { city_id: hazaribag })).toMatchObject({ city_id: hazaribag, venue_id: null, is_cover: true });
    const excessCity = await reserveUpload();
    await expect(finalizeUpload(excessCity.storage_key, { city_id: hazaribag })).rejects.toMatchObject({ code: "23514", message: "photo_limit" });
    expect(await cleanupJob(excessCity.storage_key)).toEqual(excessCity);
    expect(await count("shagun.media_assets")).toBe(25);
    expect(await count("shagun.storage_cleanup_jobs")).toBe(2);
  });

  it("keeps finalized draft media and pending roots private and exposes only published/active owners", async () => {
    const liveVenue = await published();
    const draftVenue = await createVenue();
    const liveJob = await reserveUpload();
    const livePhoto = await finalizeUpload(liveJob.storage_key, { venue_id: liveVenue });
    const cityJob = await reserveUpload();
    const cityPhoto = await finalizeUpload(cityJob.storage_key, { city_id: hazaribag });
    const draftJob = await reserveUpload();
    await finalizeUpload(draftJob.storage_key, { venue_id: draftVenue });
    const pending = await reserveUpload();
    for (const [role, user] of [["anon", null], ["authenticated", STRANGER], ["authenticated", INACTIVE_ADMIN]] as const) {
      expect(await count("shagun.media_assets", role, user)).toBe(0);
      expect(await rpc("venue_document", { p_id: liveVenue }, role, user)).toBeNull();
      expect(await rpc("public_cities", {}, role, user)).toEqual({ total: 0, items: [] });
    }
    await activate();
    expect(await rows("select storage_key from shagun.media_assets order by storage_key", [], "anon", null))
      .toEqual([livePhoto.storage_key, cityPhoto.storage_key].sort().map((storage_key) => ({ storage_key })));
    expect(await rpc("venue_document", { p_id: draftVenue }, "anon", null)).toBeNull();
    for (const [role, user] of [["anon", null], ["authenticated", STRANGER], ["authenticated", ADMIN]] as const) {
      const venues = await search({}, role, user);
      const cities = await rpc<CityResults>("public_cities", {}, role, user);
      const sitemap = await rpc<SitemapResults>("sitemap_entries", {}, role, user);
      expect(venues.items.map((venue) => venue.id)).toEqual([liveVenue]);
      expect(venues.items[0].photos).toEqual([livePhoto]);
      expect(cities.items[0].cover).toEqual(cityPhoto);
      const serialized = JSON.stringify({ venues, cities, sitemap });
      expect(serialized).not.toContain(draftJob.storage_key);
      expect(serialized).not.toContain(pending.storage_key);
    }
    await editCity(hazaribag, { status: "inactive" });
    expect(await count("shagun.media_assets", "anon", null)).toBe(0);
  });
});

describe("service-only abuse prevention and privacy-preserving aggregate events", () => {
  it("does not expose service security-definer functions or trigger helpers through default EXECUTE grants", async () => {
    for (const [role, user] of [["anon", null], ["authenticated", STRANGER], ["authenticated", ADMIN]] as const) {
      await expect(rpc("consume_rate_limit", { p_key: "synthetic:hmac", p_limit: 3, p_seconds: 120 }, role, user)).rejects.toMatchObject({ code: "42501" });
      await expect(rpc("record_event", { p_event: "city_viewed", p_city: hazaribag }, role, user)).rejects.toMatchObject({ code: "42501" });
      await expect(value("shagun_private.media_changed()", [], role, user)).rejects.toMatchObject({ code: "42501" });
      await expect(count("shagun.rate_limits", role, user)).rejects.toMatchObject({ code: "42501" });
      await expect(rows("insert into shagun.analytics_daily (day, event, city_id) values (current_date, 'city_viewed', $1)", [hazaribag], role, user))
        .rejects.toMatchObject({ code: "42501" });
    }
    // Read policies are supplementary to ACLs, and every domain table enables RLS.
    const tables = await db.query<{ relname: string; relrowsecurity: boolean }>(
      "select relname, relrowsecurity from pg_class where relnamespace = 'shagun'::regnamespace and relkind = 'r'");
    expect(tables.rows).toHaveLength(10);
    expect(tables.rows.every((t) => t.relrowsecurity)).toBe(true);
    const unsafeFunctions = await db.query<{ proname: string }>(`select p.proname from pg_proc p
      where p.pronamespace in ('shagun'::regnamespace, 'shagun_private'::regnamespace)
        and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
          where acl.grantee = 0 and acl.privilege_type = 'EXECUTE')`);
    expect(unsafeFunctions.rows).toEqual([]);
  });

  it("atomically consumes a fixed window, preserves its deadline, and resets only after expiry", async () => {
    const args = { p_key: "synthetic-login:hmac_digest_only", p_limit: 3, p_seconds: 120 };
    expect(await rpc("consume_rate_limit", args, "service_role", null)).toBe(true);
    const first = await value<{ hits: number; resets_at: string }>("(select to_jsonb(r) from shagun.rate_limits r where key = $1)", [args.p_key], "service_role", null);
    expect(await rpc("consume_rate_limit", args, "service_role", null)).toBe(true);
    expect(await rpc("consume_rate_limit", args, "service_role", null)).toBe(true);
    expect(await rpc("consume_rate_limit", args, "service_role", null)).toBe(false);
    const blocked = await value<{ hits: number; resets_at: string }>("(select to_jsonb(r) from shagun.rate_limits r where key = $1)", [args.p_key], "service_role", null);
    expect(blocked.hits).toBe(4);
    expect(blocked.resets_at).toBe(first.resets_at);
    await rows("update shagun.rate_limits set resets_at = transaction_timestamp() - interval '1 second' where key = $1", [args.p_key], "service_role", null);
    expect(await rpc("consume_rate_limit", args, "service_role", null)).toBe(true);
    const reset = await value<{ hits: number; resets_at: string }>("(select to_jsonb(r) from shagun.rate_limits r where key = $1)", [args.p_key], "service_role", null);
    expect(reset.hits).toBe(1);
    expect(Date.parse(reset.resets_at)).toBeGreaterThan(Date.parse(first.resets_at));
  });

  it("bounds rate input and expired-bucket cleanup without evicting live windows", async () => {
    for (const invalid of [{ p_limit: 0 }, { p_limit: 10001 }, { p_seconds: 0 }, { p_seconds: 86401 }, { p_key: "" }, { p_key: "x".repeat(201) }, { p_key: "synthetic@example.invalid" }]) {
      await expect(rpc("consume_rate_limit", { p_key: "synthetic:hmac", p_limit: 10, p_seconds: 120, ...invalid }, "service_role", null)).rejects.toMatchObject({ code: "22023" });
    }
    await rows("insert into shagun.rate_limits (key, hits, resets_at) select 'synthetic-expired:' || i, 1, transaction_timestamp() - interval '1 day' from generate_series(1,101) i", [], "service_role", null);
    await rows("insert into shagun.rate_limits (key, hits, resets_at) values ('synthetic-live:hmac', 1, transaction_timestamp() + interval '1 day')", [], "service_role", null);
    await rpc("consume_rate_limit", { p_key: "synthetic-current:hmac", p_limit: 1, p_seconds: 120 }, "service_role", null);
    expect(await count("shagun.rate_limits", "service_role", null)).toBe(3); // 1 expired + 1 live + current.
    expect(await value<number>("(select count(*)::integer from shagun.rate_limits where key = 'synthetic-live:hmac')", [], "service_role", null)).toBe(1);
    expect(await rpc("consume_rate_limit", { p_key: "synthetic-current:hmac", p_limit: 1, p_seconds: 120 }, "service_role", null)).toBe(false);
    expect(await count("shagun.rate_limits", "service_role", null)).toBe(2);
  });

  it("records the six supported event types as UTC-day counts with no raw search or user identifiers", async () => {
    const id = await published();
    await activate();
    for (const event of ["city_viewed", "venue_viewed", "search_performed", "filter_used", "phone_clicked", "whatsapp_clicked"]) {
      const venueRequired = ["venue_viewed", "phone_clicked", "whatsapp_clicked"].includes(event);
      await rpc("record_event", { p_event: event, p_city: hazaribag, p_venue: venueRequired ? id : null }, "service_role", null);
    }
    await rpc("record_event", { p_event: "phone_clicked", p_city: hazaribag, p_venue: id }, "service_role", null);
    const events = await rows<{ value: { day: string; event: string; city_id: string; venue_key: string; count: number } }>("select to_jsonb(a) as value from shagun.analytics_daily a order by event");
    expect(events).toHaveLength(6);
    expect(events.find((r) => r.value.event === "phone_clicked")?.value).toMatchObject({ count: 2, venue_key: id, city_id: hazaribag });
    const today = await value<string>("((transaction_timestamp() at time zone 'UTC')::date)::text", [], "service_role", null);
    for (const { value: event } of events) {
      expect(Object.keys(event).sort()).toEqual(["day", "event", "city_id", "venue_key", "count"].sort());
      expect(event.day).toBe(today);
    }
    expect(await count("shagun.analytics_daily", "authenticated", STRANGER)).toBe(0);
    await expect(count("shagun.analytics_daily", "anon", null)).rejects.toMatchObject({ code: "42501" });
  });

  it("rejects unsupported events/missing contact venues and ignores nonpublic, missing or mismatched contexts", async () => {
    const id = await published();
    const draft = await createVenue();
    const other = await createCity();
    await published({}, other);
    await rpc("record_event", { p_event: "city_viewed", p_city: hazaribag }, "service_role", null); // Draft city.
    expect(await count("shagun.analytics_daily")).toBe(0);
    await activate();
    await activate(other);
    for (const event of ["venue_viewed", "phone_clicked", "whatsapp_clicked", "unknown_event"]) {
      await expect(rpc("record_event", { p_event: event, p_city: hazaribag }, "service_role", null)).rejects.toMatchObject({ code: "22023" });
    }
    for (const args of [
      { p_city: MISSING }, { p_city: null }, { p_city: hazaribag, p_venue: MISSING },
      { p_city: hazaribag, p_venue: draft }, { p_city: other, p_venue: id },
    ]) await rpc("record_event", { p_event: "search_performed", ...args }, "service_role", null);
    expect(await count("shagun.analytics_daily")).toBe(0);
    await editVenue(id, { status: "unpublished" });
    await rpc("record_event", { p_event: "phone_clicked", p_city: hazaribag, p_venue: id }, "service_role", null);
    expect(await count("shagun.analytics_daily")).toBe(0);
  });

  it("bounds aggregate retention cleanup and preserves the 90-day boundary", async () => {
    await published();
    await activate();
    await rows(`insert into shagun.analytics_daily (day, event, city_id)
      select (transaction_timestamp() at time zone 'UTC')::date - (100 + i), 'search_performed', $1
      from generate_series(1,501) i`, [hazaribag], "service_role", null);
    await rows("insert into shagun.analytics_daily (day, event, city_id) values ((transaction_timestamp() at time zone 'UTC')::date - 90, 'search_performed', $1)", [hazaribag], "service_role", null);
    await rpc("record_event", { p_event: "search_performed", p_city: hazaribag }, "service_role", null);
    expect(await count("shagun.analytics_daily")).toBe(3); // One old row, boundary, today.
    await rpc("record_event", { p_event: "search_performed", p_city: hazaribag }, "service_role", null);
    expect(await count("shagun.analytics_daily")).toBe(2);
    expect(await value<number>("(select count(*)::integer from shagun.analytics_daily where day = (transaction_timestamp() at time zone 'UTC')::date - 90)")).toBe(1);
  });
});

describe("Supabase private Storage integration under real roles", () => {
  function objectInsert(path: string, role: Role = "authenticated", user: string | null = ADMIN) {
    return rows("insert into storage.objects (bucket_id, name, metadata) values ('shagun-media', $1, '{\"mimetype\":\"image/webp\"}') returning name", [path], role, user);
  }

  it.each([
    ["missing objects table", "alter table storage.objects rename to synthetic_missing_objects", "55000", "shagun_requires_managed_storage_objects"],
    ["disabled RLS", "alter table storage.objects disable row level security", "55000", "shagun_requires_storage_rls"],
    ["missing schema USAGE", "revoke usage on schema storage from authenticated", "42501", "shagun_requires_storage_authenticated_privileges"],
    ["missing SELECT", "revoke select on storage.objects from authenticated", "42501", "shagun_requires_storage_authenticated_privileges"],
    ["missing INSERT", "revoke insert on storage.objects from authenticated", "42501", "shagun_requires_storage_authenticated_privileges"],
    ["missing DELETE", "revoke delete on storage.objects from authenticated", "42501", "shagun_requires_storage_authenticated_privileges"],
  ])("fails preflight rather than repairing managed Storage: %s", async (_label, fixtureSql, code, message) => {
    const before = await sharedState();
    // Broken provider prerequisites are simulated and rolled back ONLY in PGlite.
    await db.exec("begin");
    try {
      await db.exec(fixtureSql);
      await expect(db.exec(storageMigration)).rejects.toMatchObject({ code, message });
    } finally { await db.exec("rollback"); }
    expect(await sharedState()).toEqual(before);
  });

  it("refuses to adopt an existing bucket even when its settings differ, leaving its metadata and objects intact", async () => {
    await db.exec("begin");
    try {
      await db.exec(`update storage.buckets set name = 'Synthetic preexisting bucket', public = true,
        file_size_limit = 1024, allowed_mime_types = array['image/png'] where id = 'shagun-media';
        insert into storage.objects (bucket_id, name, metadata)
        values ('shagun-media', 'synthetic-existing.png', '{"synthetic":true,"keep":"existing-bucket-object"}')`);
      const bucket = (await db.query("select to_jsonb(b) as value from storage.buckets b where id = 'shagun-media'")).rows;
      const objects = (await db.query("select to_jsonb(o) as value from storage.objects o where bucket_id = 'shagun-media' order by id")).rows;
      await db.exec("savepoint synthetic_existing_bucket");
      await expect(db.exec(storageMigration)).rejects.toMatchObject({ code: "23505" });
      await db.exec("rollback to savepoint synthetic_existing_bucket");
      expect((await db.query("select to_jsonb(b) as value from storage.buckets b where id = 'shagun-media'")).rows).toEqual(bucket);
      expect((await db.query("select to_jsonb(o) as value from storage.objects o where bucket_id = 'shagun-media' order by id")).rows).toEqual(objects);
    } finally { await db.exec("rollback"); }
  });

  it("installs exactly six Shagun-prefixed policies on the shared objects table", async () => {
    const policies = await rows(`select schemaname, tablename, policyname, cmd, permissive
      from pg_catalog.pg_policies where policyname ~ '^shagun_media_' order by policyname`);
    expect(policies).toEqual([
      ["shagun_media_admin_delete", "DELETE", "PERMISSIVE"],
      ["shagun_media_admin_insert", "INSERT", "PERMISSIVE"],
      ["shagun_media_admin_read", "SELECT", "PERMISSIVE"],
      ["shagun_media_anon_guard", "ALL", "RESTRICTIVE"],
      ["shagun_media_auth_guard", "ALL", "RESTRICTIVE"],
      ["shagun_media_no_overwrite", "UPDATE", "RESTRICTIVE"],
    ].map(([policyname, cmd, permissive]) => ({ schemaname: "storage", tablename: "objects", policyname, cmd, permissive })));
  });

  it("creates a private WebP-only 3 MiB bucket and permits only current admins to upload/read/delete derivatives", async () => {
    const settings = await value<{ public: boolean; file_size_limit: number; allowed_mime_types: string[] }>(
      "(select to_jsonb(b) from storage.buckets b where id = 'shagun-media')", [], "service_role", null);
    expect(settings).toMatchObject({ public: false, file_size_limit: 3145728, allowed_mime_types: ["image/webp"] });
    const root = randomUUID();
    for (const width of [480, 960, 1600]) await objectInsert(`${root}/${width}.webp`);
    expect(await count("storage.objects")).toBe(3);
    expect(await count("storage.objects", "anon", null)).toBe(0);
    expect(await count("storage.objects", "authenticated", STRANGER)).toBe(0);
    expect(await count("storage.objects", "authenticated", INACTIVE_ADMIN)).toBe(0);
    await expect(objectInsert(`${randomUUID()}/480.webp`, "anon", null)).rejects.toMatchObject({ code: "42501" });
    await expect(objectInsert(`${randomUUID()}/480.webp`, "authenticated", STRANGER)).rejects.toMatchObject({ code: "42501" });
    expect(await rows("delete from storage.objects returning id", [], "anon", null)).toEqual([]);
    expect(await rows("delete from storage.objects returning id", [], "authenticated", STRANGER)).toEqual([]);
    expect(await rows("delete from storage.objects returning id")).toHaveLength(3);
  });

  it.each(["../480.webp", "synthetic/480.webp", `${MISSING}/original.jpg`, `${MISSING}/480.png`, `${MISSING}/320.webp`,
    `${MISSING}/480.webp/other`, `${MISSING}/../480.webp`, `${MISSING}/480.WEBP`, `/${MISSING}/480.webp`])
    ("rejects invalid derivative paths %s", async (path) => {
      await expect(objectInsert(path)).rejects.toMatchObject({ code: "42501" });
      expect(await count("storage.objects")).toBe(0);
    });

  it("forbids overwriting existing objects and revokes object access when allowlist membership is deactivated", async () => {
    const path = `${randomUUID()}/480.webp`;
    await objectInsert(path);
    expect(await rows("update storage.objects set metadata = '{}'::jsonb returning id")).toEqual([]);
    await expect(objectInsert(path)).rejects.toMatchObject({ code: "23505" });
    await rows("update shagun.admin_users set is_active = false where id = $1", [ADMIN], "service_role", null);
    expect(await count("storage.objects", "authenticated", ADMIN)).toBe(0);
    await expect(objectInsert(`${randomUUID()}/960.webp`)).rejects.toMatchObject({ code: "42501" });
    expect(await count("storage.objects", "authenticated", SECOND_ADMIN)).toBe(1);
    expect(await count("storage.objects", "service_role", null)).toBe(1); // Explicit trusted backend BYPASSRLS.
  });

  it("restrictive bucket guards withstand preexisting broad permissive policies without affecting other buckets", async () => {
    // The legacy broad policy and sibling bucket were installed BEFORE migrations
    // and stay in place throughout the suite; no unrelated policy is dropped.
    const path = `${randomUUID()}/480.webp`;
    await objectInsert(path);
    expect(await count("storage.objects", "anon", null)).toBe(0);
    expect(await count("storage.objects", "authenticated", STRANGER)).toBe(0);
    await expect(objectInsert(`${randomUUID()}/960.webp`, "anon", null)).rejects.toMatchObject({ code: "42501" });
    await expect(objectInsert(`${randomUUID()}/960.webp`, "authenticated", STRANGER)).rejects.toMatchObject({ code: "42501" });
    expect(await rows("update storage.objects set metadata = '{}'::jsonb returning id")).toEqual([]);
    await rows("insert into storage.objects (bucket_id, name) values ('synthetic-other-bucket', 'synthetic-other-object')", [], "anon", null);
    expect(await rows<{ name: string }>("select name from storage.objects", [], "anon", null)).toEqual([{ name: "synthetic-other-object" }]);
  });

  it.each(["synthetic-other-bucket", null])("keeps guards neutral for other or NULL bucket IDs: %s", async (bucket) => {
    for (const [role, user] of [["anon", null], ["authenticated", SIBLING_USER], ["authenticated", ADMIN]] as const) {
      const name = `synthetic-unrestricted-${randomUUID()}.jpg`;
      const metadata = { synthetic: true, keep: "sibling-write" };
      expect(await rows("insert into storage.objects (bucket_id, name, metadata) values ($1, $2, $3::jsonb) returning bucket_id, name, metadata",
        [bucket, name, JSON.stringify(metadata)], role, user)).toEqual([{ bucket_id: bucket, name, metadata }]);
      expect(await rows("select bucket_id, name, metadata from storage.objects where bucket_id is not distinct from $1 and name = $2",
        [bucket, name], role, user)).toEqual([{ bucket_id: bucket, name, metadata }]);
      const changed = { synthetic: true, keep: "sibling-update" };
      expect(await rows(`update storage.objects set metadata = $3::jsonb
        where bucket_id is not distinct from $1 and name = $2 returning bucket_id, name, metadata`,
      [bucket, name, JSON.stringify(changed)], role, user)).toEqual([{ bucket_id: bucket, name, metadata: changed }]);
      // Neutrality outside Shagun must not allow moving legacy rows INTO it.
      await expect(rows(`update storage.objects set bucket_id = 'shagun-media', name = $3
        where bucket_id is not distinct from $1 and name = $2 returning id`,
      [bucket, name, `${randomUUID()}/480.webp`], role, user)).rejects.toMatchObject({ code: "42501" });
      expect(await rows("delete from storage.objects where bucket_id is not distinct from $1 and name = $2 returning bucket_id, name, metadata",
        [bucket, name], role, user)).toEqual([{ bucket_id: bucket, name, metadata: changed }]);
    }
  }, 30_000);
});