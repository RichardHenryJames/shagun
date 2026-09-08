import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { stderr, stdout } from "node:process";
import postgres from "postgres";
import {
  APP_ROLES, OPERATOR_PLAN, PRIVATE_FUNCTION_GRANTS, RPC_CONTRACTS, SHAGUN_TABLES,
  SHARED_TABLES, STORAGE_POLICIES, TABLE_PRIVILEGES, SafeError, assertPreserved,
  assertStorageState, connectionOptions, connectionTarget, exposedSchemas, migrationPlan,
  parseArguments, readMigrationSources, safeTarget, sanitizedFailure, sha256, tablePrivileges, validateSeed,
  type Fingerprint, type LedgerRow, type Migration, type NamespaceState, type PreservationSnapshot,
} from "./db-migration-plan";

// Explicit operator entry point only; not imported by application/build scripts.
// From Shagun: npx tsx scripts/db-migrate.ts --source-env ../biharibhojan/.env
//   --expected-project-ref ixkhyqqovacdramymqjk
// Inspect first. Only a separately authorized invocation adds --apply [--seed].
// This CommonJS tsx entry point uses __dirname, not the caller's working directory,
// for reviewed SQL. The explicitly supplied environment path is cwd-relative.
type Tx = postgres.TransactionSql;
type ManagedSchema = "public" | "auth" | "storage";
let inspectionStage = "connection";

function acl(tx: Tx, expression: string) {
  // expression is exclusively a checked-in catalog expression below, never input.
  return tx.unsafe(`(select coalesce(jsonb_agg(jsonb_build_object(
    'grantor', g.grantor::text, 'grantee', g.grantee::text,
    'privilege', g.privilege_type, 'grantable', g.is_grantable)
    order by g.grantor, g.grantee, g.privilege_type, g.is_grantable), '[]'::jsonb)
    from pg_catalog.aclexplode(${expression}) g)`);
}

async function metadataSnapshot(tx: Tx, schema: ManagedSchema, newStorage: boolean, newInventory: boolean): Promise<string> {
  inspectionStage = `metadata-${schema}`;
  // Logical metadata only: no reltuples/pages/statistics, Auth records, function
  // bodies, role passwords/config blobs or arbitrary settings. Owners/grantees
  // are OIDs, not login names. The JSON is deterministic and NEVER logged/saved.
  const [row] = await tx<{ snapshot: string }[]>`
    select jsonb_build_object(
      'schema', jsonb_build_object('name', n.nspname, 'owner', n.nspowner::text,
        'acl', ${acl(tx, "coalesce(n.nspacl, pg_catalog.acldefault('n', n.nspowner))")}),
      'relations', (select coalesce(jsonb_agg(jsonb_build_object(
        'name', c.relname, 'kind', c.relkind, 'owner', c.relowner::text,
        'persistence', c.relpersistence, 'rls', c.relrowsecurity, 'forceRls', c.relforcerowsecurity,
        'replicaIdentity', c.relreplident, 'partition', c.relispartition,
        'partitionBound', pg_get_expr(c.relpartbound, c.oid),
        'options', (select coalesce(jsonb_agg(o order by o collate "C"), '[]'::jsonb) from unnest(c.reloptions) o),
        'acl', ${acl(tx, "coalesce(c.relacl, pg_catalog.acldefault(case when c.relkind = 'S' then 's'::\"char\" else 'r'::\"char\" end, c.relowner))")},
        'view', case when c.relkind in ('v', 'm') then pg_get_viewdef(c.oid, false) else null end,
        'parents', (select coalesce(jsonb_agg(i.inhparent::text order by i.inhseqno), '[]'::jsonb)
          from pg_inherits i where i.inhrelid = c.oid),
        'columns', (select coalesce(jsonb_agg(jsonb_build_object(
          'position', a.attnum, 'name', a.attname, 'type', format_type(a.atttypid, a.atttypmod),
          'typeOid', a.atttypid::text, 'typeModifier', a.atttypmod, 'collation', a.attcollation::text,
          'notNull', a.attnotnull, 'identity', a.attidentity, 'generated', a.attgenerated,
          'storage', a.attstorage, 'compression', a.attcompression, 'inherited', a.attinhcount,
          'default', pg_get_expr(d.adbin, d.adrelid),
          'acl', ${acl(tx, "coalesce(a.attacl, '{}'::aclitem[])")}) order by a.attnum), '[]'::jsonb)
          from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
          where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped),
        'constraints', (select coalesce(jsonb_agg(jsonb_build_object(
          'name', k.conname, 'type', k.contype, 'definition', pg_get_constraintdef(k.oid, false),
          'validated', k.convalidated, 'deferrable', k.condeferrable, 'deferred', k.condeferred,
          'local', k.conislocal, 'inheritCount', k.coninhcount, 'noInherit', k.connoinherit)
          order by k.conname collate "C"), '[]'::jsonb) from pg_constraint k where k.conrelid = c.oid),
        'indexes', (select coalesce(jsonb_agg(jsonb_build_object(
          'name', ic.relname, 'owner', ic.relowner::text, 'definition', pg_get_indexdef(i.indexrelid),
          'valid', i.indisvalid, 'ready', i.indisready, 'live', i.indislive,
          'clustered', i.indisclustered, 'replicaIdentity', i.indisreplident, 'options', ic.reloptions)
          order by ic.relname collate "C"), '[]'::jsonb)
          from pg_index i join pg_class ic on ic.oid = i.indexrelid where i.indrelid = c.oid),
        'triggers', (select coalesce(jsonb_agg(jsonb_build_object(
          'name', t.tgname, 'enabled', t.tgenabled, 'internal', t.tgisinternal,
          'function', t.tgfoid::text, 'definition', pg_get_triggerdef(t.oid, false))
          order by t.tgname collate "C"), '[]'::jsonb)
          from pg_trigger t where t.tgrelid = c.oid and not (
            ${newInventory} and n.nspname = 'auth' and c.relname = 'users' and t.tgisinternal
            and exists (select 1 from pg_constraint fk where fk.oid = t.tgconstraint
              and fk.contype = 'f' and fk.conname = 'admin_users_id_fkey'
              and fk.conrelid = to_regclass('shagun.admin_users') and fk.confrelid = c.oid
              and t.tgconstrrelid = fk.conrelid))),
        'policies', (select coalesce(jsonb_agg(jsonb_build_object(
          'name', p.polname, 'command', p.polcmd, 'permissive', p.polpermissive,
          'roles', (select jsonb_agg(r::text order by r) from unnest(p.polroles) r),
          'using', pg_get_expr(p.polqual, p.polrelid), 'check', pg_get_expr(p.polwithcheck, p.polrelid))
          order by p.polname collate "C"), '[]'::jsonb) from pg_policy p where p.polrelid = c.oid
          and not (${newStorage} and n.nspname = 'storage' and c.relname = 'objects'
            and p.polname::text = any(${tx.array([...STORAGE_POLICIES], 25)}::text[])))
        ) order by c.relname collate "C"), '[]'::jsonb)
        from pg_class c where c.relnamespace = n.oid and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')),
      'types', (select coalesce(jsonb_agg(jsonb_build_object(
        'name', t.typname, 'kind', t.typtype, 'owner', t.typowner::text,
        'baseType', t.typbasetype::text, 'notNull', t.typnotnull, 'default', t.typdefault,
        'acl', ${acl(tx, "coalesce(t.typacl, pg_catalog.acldefault('T', t.typowner))")},
        'labels', (select jsonb_agg(e.enumlabel order by e.enumsortorder) from pg_enum e where e.enumtypid = t.oid))
        order by t.typname collate "C"), '[]'::jsonb) from pg_type t where t.typnamespace = n.oid),
      'routines', (select coalesce(jsonb_agg(jsonb_build_object(
        'name', p.proname, 'arguments', pg_get_function_identity_arguments(p.oid),
        'result', pg_get_function_result(p.oid), 'kind', p.prokind, 'owner', p.proowner::text,
        'definer', p.prosecdef, 'volatility', p.provolatile, 'leakproof', p.proleakproof,
        'strict', p.proisstrict, 'acl', ${acl(tx, "coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))")})
        order by p.proname collate "C", p.oid), '[]'::jsonb) from pg_proc p where p.pronamespace = n.oid),
      'defaultPrivileges', (select coalesce(jsonb_agg(jsonb_build_object(
        'role', d.defaclrole::text, 'namespace', d.defaclnamespace::text, 'type', d.defaclobjtype,
        'acl', ${acl(tx, "d.defaclacl")}) order by d.defaclrole, d.defaclnamespace, d.defaclobjtype), '[]'::jsonb)
        from pg_default_acl d where d.defaclnamespace in (0, n.oid)),
      'roleMemberships', (select coalesce(jsonb_agg(to_jsonb(m) order by m.roleid, m.member, m.grantor), '[]'::jsonb) from pg_auth_members m),
      'roleCapabilities', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.oid::text, 'superuser', r.rolsuper, 'inherit', r.rolinherit, 'bypassRls', r.rolbypassrls)
        order by r.oid), '[]'::jsonb) from pg_roles r)
    )::text as snapshot
    from pg_namespace n where n.nspname = ${schema}
  `;
  if (!row) throw new SafeError("MANAGED_DEPENDENCIES");
  return row.snapshot;
}

async function sharedFingerprint(tx: Tx, table: typeof SHARED_TABLES[number]): Promise<Fingerprint> {
  inspectionStage = `fingerprint-${table}`;
  // Row JSON and individual hashes NEVER cross the wire. Four numeric sums have
  // bounded aggregate state and preserve duplicates without string_agg/array_agg
  // of an entire customer dataset. A timeout is a failure, never a sampled pass.
  const [row] = await tx<Fingerprint[]>`
    with hashes as (select md5(to_jsonb(entry)::text) as h from public.${tx(table)} entry)
    select count(*)::text as count,
      md5(count(*)::text || ':' ||
        coalesce(sum(('x' || substr(h, 1, 8))::bit(32)::bigint), 0)::text || ':' ||
        coalesce(sum(('x' || substr(h, 9, 8))::bit(32)::bigint), 0)::text || ':' ||
        coalesce(sum(('x' || substr(h, 17, 8))::bit(32)::bigint), 0)::text || ':' ||
        coalesce(sum(('x' || substr(h, 25, 8))::bit(32)::bigint), 0)::text) as digest
    from hashes
  `;
  if (!row || !/^\d+$/.test(row.count) || !/^[a-f0-9]{32}$/.test(row.digest)) throw new SafeError("SNAPSHOT_CHANGED");
  return { count: row.count, digest: row.digest };
}

async function snapshot(tx: Tx, sharedTables: readonly typeof SHARED_TABLES[number][], newStorage = false, newInventory = false): Promise<PreservationSnapshot> {
  const metadata = {
    public: await metadataSnapshot(tx, "public", newStorage, newInventory),
    auth: await metadataSnapshot(tx, "auth", newStorage, newInventory),
    storage: await metadataSnapshot(tx, "storage", newStorage, newInventory),
  };
  const shared: PreservationSnapshot["shared"] = {};
  for (const table of sharedTables) shared[table] = await sharedFingerprint(tx, table);
  const [counts] = await tx<{ auth_users: string; storage_objects: string; buckets: string }[]>`
    select (select count(*)::text from auth.users) as auth_users,
      (select count(*)::text from storage.objects) as storage_objects,
      (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'public', b.public)
        order by b.id collate "C"), '[]'::jsonb)::text
       from storage.buckets b where not (${newStorage} and b.id = 'shagun-media')) as buckets
  `;
  if (!counts) throw new SafeError("MANAGED_DEPENDENCIES");
  return { metadata, shared, buckets: counts.buckets, authUsers: counts.auth_users, storageObjects: counts.storage_objects };
}

function snapshotSummary(value: PreservationSnapshot) {
  const buckets: unknown = JSON.parse(value.buckets);
  if (!Array.isArray(buckets)) throw new SafeError("SNAPSHOT_CHANGED");
  return {
    sharedTables: value.shared, authUserCount: value.authUsers, storageObjectCount: value.storageObjects,
    existingBuckets: { count: String(buckets.length), digest: sha256(value.buckets) },
    metadataDigests: { public: sha256(value.metadata.public), auth: sha256(value.metadata.auth), storage: sha256(value.metadata.storage) },
  };
}

async function namespaceState(tx: Tx): Promise<NamespaceState> {
  const [state] = await tx<NamespaceState[]>`
    select exists(select 1 from pg_namespace where nspname = 'shagun') as shagun,
      exists(select 1 from pg_namespace where nspname = 'shagun_private') as private,
      to_regclass('shagun_private.schema_migrations') is not null as ledger
  `;
  if (!state) throw new SafeError("NAMESPACE_STATE");
  return state;
}

async function readLedger(tx: Tx): Promise<LedgerRow[]> {
  // Validate the ledger BEFORE trusting a query against it (no views, triggers,
  // policies, application/column ACLs, extra columns or non-owner execution).
  const [shape] = await tx<{ valid: boolean }[]>`
    select c.relkind = 'r' and not c.relrowsecurity and not c.relforcerowsecurity
      and c.relowner = (select oid from pg_roles where rolname = current_user)
      and n.nspowner = c.relowner
      and (select count(*) = 3 from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped)
      and (select count(*) = 3 from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
        and a.attnotnull and a.attidentity = '' and a.attgenerated = ''
        and ((a.attnum = 1 and a.attname = 'version' and a.atttypid = 'text'::regtype)
          or (a.attnum = 2 and a.attname = 'checksum' and a.atttypid = 'text'::regtype)
          or (a.attnum = 3 and a.attname = 'applied_at' and a.atttypid = 'timestamptz'::regtype)))
      and (select count(*) = 1 from pg_constraint k where k.conrelid = c.oid)
      and exists(select 1 from pg_constraint k where k.conrelid = c.oid and k.contype = 'p'
        and k.conkey = array[1]::smallint[] and k.convalidated and not k.condeferrable)
      and (select count(*) = 1 from pg_index i where i.indrelid = c.oid)
      and not exists(select 1 from pg_index i where i.indrelid = c.oid and (not i.indisvalid or not i.indisready))
      and not exists(select 1 from pg_trigger t where t.tgrelid = c.oid)
      and not exists(select 1 from pg_rewrite r where r.ev_class = c.oid)
      and not exists(select 1 from pg_policy p where p.polrelid = c.oid)
      and (select count(*) = 1 from pg_attrdef d where d.adrelid = c.oid)
      and exists(select 1 from pg_attrdef d where d.adrelid = c.oid and d.adnum = 3
        and pg_get_expr(d.adbin, d.adrelid) = 'transaction_timestamp()')
      and not exists(select 1 from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a where a.grantee <> c.relowner)
      and not exists(select 1 from pg_attribute a cross join lateral aclexplode(a.attacl) g
        where a.attrelid = c.oid and g.grantee <> c.relowner)
      and not exists(select 1 from pg_roles r where r.rolname = any(${tx.array([...APP_ROLES], 25)}::text[])
        and (has_table_privilege(r.oid, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
          or has_any_column_privilege(r.oid, c.oid, 'SELECT,INSERT,UPDATE,REFERENCES'))) as valid
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.oid = to_regclass('shagun_private.schema_migrations')
  `;
  // ANY-privilege lists above intentionally detect ANY forbidden access.
  if (!shape?.valid) throw new SafeError("LEDGER_INVALID");
  const rows = await tx<LedgerRow[]>`
    select version, checksum from shagun_private.schema_migrations order by version collate "C" limit 5
  `;
  return rows.map((row) => ({ version: row.version, checksum: row.checksum }));
}

async function createLedger(tx: Tx): Promise<void> {
  // SQL 0001 has already created/restricted the namespaces and helper functions.
  // A TABLE in the private schema is unaffected by REVOKE ALL ON ALL FUNCTIONS.
  await tx`create table shagun_private.schema_migrations (
    version text primary key,
    checksum text not null,
    applied_at timestamptz not null default transaction_timestamp()
  )`;
  await tx`revoke all on table shagun_private.schema_migrations from public, anon, authenticated, service_role`;
}

async function apiExposure(tx: Tx) {
  // Never select pg_settings.*, rolconfig, setconfig, or JWT/secret settings.
  // Only exact pgrst.db_schemas entries cross the SQL result boundary. SQL may
  // not know about an external PostgREST environment setting; report uncertainty.
  const rows = await tx<{ value: string; source: string }[]>`
    select substring(setting from length('pgrst.db_schemas=') + 1) as value,
      case when d.setrole <> 0 then 'authenticator-setting' else 'database-setting' end as source
    from pg_db_role_setting d cross join lateral unnest(d.setconfig) setting
    where split_part(setting, '=', 1) = 'pgrst.db_schemas'
      and d.setdatabase in (0, (select oid from pg_database where datname = current_database()))
      and (d.setrole = 0 or d.setrole = (select oid from pg_roles where rolname = 'authenticator'))
    order by (d.setrole <> 0) desc, (d.setdatabase <> 0) desc
  `;
  const [session] = await tx<{ value: string | null }[]>`select current_setting('pgrst.db_schemas', true) as value`;
  const selected = rows[0] ?? { value: session?.value ?? null, source: "session-setting-or-unknown" };
  const exposure = exposedSchemas(selected.value);
  // An explicitly visible private exposure is unsafe even if another config
  // source would win; only the operator can reconcile hosted configuration.
  if ([...rows.map((row) => exposedSchemas(row.value)), exposedSchemas(session?.value ?? null)].some((value) => value.private)) {
    throw new SafeError("PRIVATE_EXPOSED");
  }
  return { source: selected.source, ...exposure, hostedConfigurationVerified: false };
}

async function storageState(tx: Tx) {
  const [bucket] = await tx<{ present: boolean; valid: boolean }[]>`
    select exists(select 1 from storage.buckets where id = 'shagun-media') as present,
      exists(select 1 from storage.buckets where id = 'shagun-media' and name = 'shagun-media'
        and not public and file_size_limit = 3145728 and allowed_mime_types = array['image/webp']::text[]) as valid
  `;
  const policies = await tx<{ name: string }[]>`
    select p.polname as name from pg_policy p where p.polrelid = to_regclass('storage.objects')
      and (p.polname::text = any(${tx.array([...STORAGE_POLICIES], 25)}::text[]) or p.polname like 'shagun_media_%')
    order by p.polname collate "C"
  `;
  if (!bucket) throw new SafeError("MANAGED_DEPENDENCIES");
  return { ...bucket, policyNames: policies.map((policy) => policy.name) };
}

async function preflight(tx: Tx, sharedGuard: boolean) {
  inspectionStage = "preflight";
  const [managed] = await tx<{ valid: boolean }[]>`
    select current_setting('server_version_num')::integer >= 150000 and current_database() = 'postgres'
      and (select count(*) = 3 from pg_namespace where nspname in ('public', 'auth', 'storage'))
      and (select count(*) = 3 from pg_roles where rolname in ('anon', 'authenticated', 'service_role'))
      and (select count(*) = 3 from pg_class where oid in (to_regclass('auth.users'),
        to_regclass('storage.buckets'), to_regclass('storage.objects')) and relkind in ('r', 'p'))
      and to_regprocedure('auth.uid()') is not null as valid
  `;
  if (!managed?.valid) throw new SafeError("MANAGED_DEPENDENCIES");
  // Trusted provider-configured delegation: https://github.com/supabase/supautils#manage-policies
  // Supautils registers policy_grants as SIGHUP; accept only protected catalog
  // contexts, never a user/internal placeholder. Never SET it, load a library,
  // or change managed grants/ownership. Only booleans leave this query; malformed
  // JSON aborts through sanitizedFailure, not a permissive fallback. Native DDL
  // permissions remain authoritative inside the all-or-nothing transaction.
  const [capabilities] = await tx<{
    storage_rls: boolean; authenticated_usage: boolean; authenticated_select: boolean;
    authenticated_insert: boolean; authenticated_delete: boolean; owner_ready: boolean;
    storage_owner_usage: boolean; storage_policy_manager: boolean;
  }[]>`
    with storage_authority as (
      select coalesce((select pg_has_role(current_user, c.relowner, 'USAGE') from pg_class c
        where c.oid = 'storage.objects'::regclass), false) as storage_owner_usage,
        coalesce((select case when s.context in ('postmaster', 'sighup', 'superuser') then
          jsonb_typeof(nullif(s.setting, '')::jsonb) = 'object'
          and jsonb_typeof(nullif(s.setting, '')::jsonb -> current_user) = 'array'
          and (nullif(s.setting, '')::jsonb -> current_user) ? 'storage.objects'
          else false end
          from pg_catalog.pg_settings s where s.name = 'supautils.policy_grants'), false) as storage_policy_manager
    )
    select (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass) as storage_rls,
      has_schema_privilege('authenticated', 'storage', 'USAGE') as authenticated_usage,
      has_table_privilege('authenticated', 'storage.objects', 'SELECT') as authenticated_select,
      has_table_privilege('authenticated', 'storage.objects', 'INSERT') as authenticated_insert,
      has_table_privilege('authenticated', 'storage.objects', 'DELETE') as authenticated_delete,
      storage_owner_usage, storage_policy_manager,
      has_database_privilege(current_user, current_database(), 'CREATE')
        and has_schema_privilege(current_user, 'auth', 'USAGE')
        and has_schema_privilege(current_user, 'storage', 'USAGE')
        and has_table_privilege(current_user, 'auth.users', 'SELECT')
        and has_table_privilege(current_user, 'auth.users', 'REFERENCES')
        and has_function_privilege(current_user, 'auth.uid()', 'EXECUTE')
        and has_table_privilege(current_user, 'storage.buckets', 'SELECT')
        and has_table_privilege(current_user, 'storage.buckets', 'INSERT')
        and has_table_privilege(current_user, 'storage.objects', 'SELECT')
        and (storage_owner_usage or storage_policy_manager)
        as owner_ready
      from storage_authority
  `;
  if (!capabilities?.storage_rls) throw new SafeError("STORAGE_RLS");
  if (!capabilities.authenticated_usage || !capabilities.authenticated_select
    || !capabilities.authenticated_insert || !capabilities.authenticated_delete) throw new SafeError("STORAGE_PERMISSIONS");
  if (!capabilities.owner_ready) throw new SafeError("MIGRATION_PRIVILEGES");
  const shared = await tx<{ name: typeof SHARED_TABLES[number]; readable: boolean; rls: boolean; forced_rls: boolean; anon_select: boolean; authenticated_select: boolean }[]>`
    select c.relname as name,
      has_schema_privilege(current_user, n.oid, 'USAGE') and has_table_privilege(current_user, c.oid, 'SELECT')
        and not row_security_active(c.oid) as readable,
      c.relrowsecurity as rls, c.relforcerowsecurity as forced_rls,
      has_schema_privilege('anon', n.oid, 'USAGE') and has_any_column_privilege('anon', c.oid, 'SELECT') as anon_select,
      has_schema_privilege('authenticated', n.oid, 'USAGE') and has_any_column_privilege('authenticated', c.oid, 'SELECT') as authenticated_select
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname::text = any(${tx.array([...SHARED_TABLES], 25)}::text[]) and c.relkind in ('r', 'p')
    order by c.relname collate "C"
  `;
  if ((sharedGuard && shared.length !== SHARED_TABLES.length) || shared.some((table) => !table.readable)) throw new SafeError("SHARED_TABLES");
  return {
    managedPrerequisites: capabilities, sharedTableSecurity: shared.map((table) => ({ ...table })),
    sharedTables: shared.map((table) => table.name), exposure: await apiExposure(tx),
  };
}

async function verifyOwnObjects(tx: Tx, versions: readonly string[]) {
  const withUploads = versions.includes("0004");
  const expectedRpcs = RPC_CONTRACTS.filter((rpc) => rpc.name === "sitemap_entries" ? versions.includes("0003")
    : ["begin_media_upload", "finalize_media_upload"].includes(rpc.name) ? withUploads : true);
  const tables = await tx<{ name: string; safe: boolean }[]>`
    select c.relname as name, c.relkind = 'r' and c.relrowsecurity and not c.relforcerowsecurity
      and c.relowner = (select oid from pg_roles where rolname = current_user)
      and not exists(select 1 from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) g where g.grantee = 0)
      and not exists(select 1 from pg_attribute a cross join lateral aclexplode(a.attacl) g
        where a.attrelid = c.oid and g.grantee = 0) as safe
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'shagun' and c.relkind in ('r', 'p', 'v', 'm', 'f') order by c.relname collate "C"
  `;
  if (JSON.stringify(tables.map((table) => table.name)) !== JSON.stringify(SHAGUN_TABLES) || tables.some((table) => !table.safe)) throw new SafeError("POSTCONDITIONS");

  const schemas = await tx<{ safe: boolean }[]>`
    select n.nspowner = (select oid from pg_roles where rolname = current_user)
      and not exists(select 1 from aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) g where g.grantee = 0)
      and not exists(select 1 from pg_roles r where r.rolname = any(${tx.array([...APP_ROLES], 25)}::text[])
        and (not has_schema_privilege(r.oid, n.oid, 'USAGE') or has_schema_privilege(r.oid, n.oid, 'CREATE'))) as safe
    from pg_namespace n where n.nspname in ('shagun', 'shagun_private')
  `;
  if (schemas.length !== 2 || schemas.some((schema) => !schema.safe)) throw new SafeError("POSTCONDITIONS");
  for (const table of SHAGUN_TABLES) {
    const permissions = await tx<{ role: typeof APP_ROLES[number]; privilege: string; granted: boolean; column_only: boolean; invalid_column_update: boolean }[]>`
      select r.rolname as role, permission as privilege, has_table_privilege(r.oid, c.oid, permission) as granted,
        case when permission in ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES')
          then has_any_column_privilege(r.oid, c.oid, permission) and not has_table_privilege(r.oid, c.oid, permission)
          else false end as column_only,
        exists(select 1 from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
          and a.attname <> 'id' and has_column_privilege(r.oid, c.oid, a.attnum, 'UPDATE')) as invalid_column_update
      from pg_class c cross join pg_roles r cross join unnest(${tx.array([...TABLE_PRIVILEGES], 25)}::text[]) permission
      where c.oid = to_regclass(${`shagun.${table}`}) and r.rolname = any(${tx.array([...APP_ROLES], 25)}::text[])
    `;
    if (permissions.length !== APP_ROLES.length * TABLE_PRIVILEGES.length) throw new SafeError("POSTCONDITIONS");
    for (const access of permissions) {
      const lockColumn = withUploads && table === "storage_cleanup_jobs" && access.role === "authenticated" && access.privilege === "UPDATE";
      if (access.granted !== tablePrivileges(table, access.role).includes(access.privilege)
        || access.column_only !== lockColumn || (lockColumn && access.invalid_column_update)) throw new SafeError("POSTCONDITIONS");
    }
  }
  const routines = await tx<{
    schema: string; name: string; args: string; definer: boolean; safe: boolean;
    anon: boolean; authenticated: boolean; service_role: boolean;
  }[]>`
    select n.nspname as schema, p.proname as name, oidvectortypes(p.proargtypes) as args, p.prosecdef as definer,
      p.prokind = 'f' and p.proowner = (select oid from pg_roles where rolname = current_user)
        and not exists(select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) g where g.grantee = 0)
        and (p.proconfig @> array['search_path=""']::text[] or p.proconfig @> array['search_path=']::text[]) as safe,
      has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
      has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('shagun', 'shagun_private')
    order by n.nspname collate "C", p.proname collate "C", p.oid
  `;
  if (routines.filter((routine) => routine.schema === "shagun").length !== expectedRpcs.length
    || routines.filter((routine) => routine.schema === "shagun_private").length !== Object.keys(PRIVATE_FUNCTION_GRANTS).length) throw new SafeError("POSTCONDITIONS");
  const seen = new Set<string>();
  for (const routine of routines) {
    const key = `${routine.schema}.${routine.name}`;
    if (!routine.safe || seen.has(key)) throw new SafeError("POSTCONDITIONS");
    seen.add(key);
    const contract = expectedRpcs.find((rpc) => rpc.name === routine.name && rpc.args === routine.args);
    const roles = routine.schema === "shagun" ? contract?.roles : PRIVATE_FUNCTION_GRANTS[routine.name];
    const definer = routine.schema === "shagun" ? contract?.definer : roles?.length === 0;
    if (!roles || routine.definer !== definer || APP_ROLES.some((role) => routine[role] !== roles.includes(role))) throw new SafeError("POSTCONDITIONS");
  }
  const counts: Record<string, string> = {};
  for (const table of SHAGUN_TABLES) {
    const [row] = await tx<{ count: string }[]>`select count(*)::text as count from shagun.${tx(table)}`;
    if (!row) throw new SafeError("POSTCONDITIONS");
    counts[table] = row.count;
  }
  return { tableCounts: counts, tableCount: String(SHAGUN_TABLES.length), rpcCount: String(expectedRpcs.length), privateLedgerExcluded: true, rlsAndPermissionsVerified: true };
}

async function executeMigration(tx: Tx, migration: Migration, firstInstall: boolean) {
  // A separate simple query per reviewed statement also bounds large files by
  // statement_timeout. No SQL-level BEGIN/COMMIT is permitted in these sources.
  for (const statement of migration.statements) await tx.unsafe(statement.text, [], { prepare: false }).simple();
  if (firstInstall && migration.version === "0001") await createLedger(tx);
  await tx`insert into shagun_private.schema_migrations (version, checksum) values (${migration.version}, ${migration.checksum})`;
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") throw new SafeError("TLS_CONFIGURATION");
  let sourceText: string | undefined;
  if (options.sourceEnv !== undefined) {
    try { sourceText = await readFile(resolve(process.cwd(), options.sourceEnv), "utf8"); }
    catch { throw new SafeError("SOURCE_READ"); }
  }
  const target = connectionTarget(options, {
    sourceText,
    environmentUrl: options.sourceEnv === undefined ? process.env.SHAGUN_DATABASE_URL : undefined,
  });
  sourceText = undefined; // No dotenv object is installed into process.env.
  const projectRoot = resolve(__dirname, "..");
  const migrations = await readMigrationSources(resolve(projectRoot, "supabase", "migrations"));
  let seed: string;
  try { seed = await readFile(resolve(projectRoot, "supabase", "seed.sql"), "utf8"); }
  catch { throw new SafeError("SQL_READ"); }
  validateSeed(seed);
  const sql = postgres(connectionOptions(target, options.apply));
  let completed = false;
  let report: unknown;
  try {
    report = await sql.begin(options.apply ? "isolation level repeatable read read write" : "isolation level repeatable read read only", async (tx) => {
      await tx`set local statement_timeout = '20s'`;
      await tx`set local lock_timeout = '2s'`;
      await tx`set local idle_in_transaction_session_timeout = '20s'`;
      // row_security=off does NOT bypass or disable RLS. It makes an incomplete
      // owner snapshot ERROR instead of silently returning RLS-filtered counts.
      await tx`set local row_security = off`;
      if (options.apply) {
        const [lock] = await tx<{ acquired: boolean }[]>`
          select pg_try_advisory_xact_lock(hashtextextended('shagun.schema_migration', 0)) as acquired
        `;
        if (!lock?.acquired) throw new SafeError("ADVISORY_LOCK");
      }
      const prerequisites = await preflight(tx, options.sourceEnv !== undefined);
      const state = await namespaceState(tx);
      const ledger = state.ledger ? await readLedger(tx) : [];
      const plan = migrationPlan(migrations, state, ledger);
      const storage = await storageState(tx);
      assertStorageState(plan.applied.some((migration) => migration.version === "0002"), storage.present, storage.valid, storage.policyNames);
      const existingOwn = state.shagun ? await verifyOwnObjects(tx, plan.applied.map((migration) => migration.version)) : null;
      const before = await snapshot(tx, prerequisites.sharedTables);
      const warnings: string[] = [];
      if (!prerequisites.exposure.known) warnings.push("API_SCHEMA_EXPOSURE_UNKNOWN: Inspect the hosted Data API schema list separately; no JWT settings were read.");
      if (prerequisites.exposure.public && prerequisites.sharedTableSecurity.some((table) => !table.rls && (table.anon_select || table.authenticated_select))) {
        warnings.push("EXISTING_PUBLIC_EXPOSURE: public is in the observed API list and a shared table has unfiltered application SELECT privileges. Review Bihari exposure separately; this operation leaves it unchanged.");
      }
      const common = {
        target: safeTarget(target), sharedSourceGuard: options.sourceEnv !== undefined,
        namespaces: state, prerequisites, warnings,
        migrations: migrations.map((migration) => ({ filename: migration.filename, version: migration.version, checksum: migration.checksum })),
        previouslyApplied: plan.applied.map((migration) => migration.version), pending: plan.pending.map((migration) => migration.version),
        seed: { requested: options.seed, checksum: sha256(seed), policy: "draft Hazaribag only; slug conflict does nothing" },
        baseline: snapshotSummary(before), operatorPlan: OPERATOR_PLAN,
      };
      if (!options.apply) return { status: "inspection-passed", mode: "read-only", ...common, own: existingOwn, preservationComparisonPerformed: false };

      for (const migration of plan.pending) await executeMigration(tx, migration, plan.firstInstall);
      if (options.seed) await tx.unsafe(seed, [], { prepare: false }).simple();
      const recorded = await readLedger(tx);
      const finalPlan = migrationPlan(migrations, await namespaceState(tx), recorded);
      if (finalPlan.pending.length) throw new SafeError("LEDGER_PREFIX");
      const finalStorage = await storageState(tx);
      assertStorageState(true, finalStorage.present, finalStorage.valid, finalStorage.policyNames);
      const own = await verifyOwnObjects(tx, recorded.map((row) => row.version));
      if (plan.firstInstall && SHAGUN_TABLES.some((table) => own.tableCounts[table]
        !== (table === "facilities" ? "9" : table === "cities" && options.seed ? "1" : "0"))) throw new SafeError("POSTCONDITIONS");
      const after = await snapshot(tx, prerequisites.sharedTables,
        plan.pending.some((migration) => migration.version === "0002"), plan.firstInstall);
      const preservation = assertPreserved(before, after);
      // Returning does not commit early: postgres.js commits only after this
      // callback succeeds. No success output escapes until BEGIN's promise and
      // the finally-close both succeed. Network-at-COMMIT ambiguity is documented.
      return { status: "applied", mode: "explicit-apply", ...common, appliedNow: plan.pending.map((migration) => migration.version),
        own, preservationComparisonPerformed: true, preservation, after: snapshotSummary(after),
        newStorage: { privateBucketVerified: finalStorage.valid, policyCount: String(finalStorage.policyNames.length) } };
    });
    completed = true;
  } finally {
    // Do not replace the original failure with a secondary close error.
    try { await sql.end({ timeout: 5 }); }
    catch (error) { if (completed) throw error; }
  }
  stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

void main().catch((error: unknown) => {
  const position = error && typeof error === "object" && "position" in error && /^\d+$/.test(String(error.position)) ? Number(error.position) : undefined;
  stderr.write(`${JSON.stringify({ status: "failed", stage: inspectionStage, position, ...sanitizedFailure(error),
    next: "No automatic retry. Transaction failures request rollback; a connection failure at commit may have an unknown outcome. Re-inspect the ledger before explicitly retrying. No raw exception details are logged." })}\n`);
  process.exitCode = 1;
});