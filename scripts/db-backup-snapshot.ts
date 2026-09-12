// Deliberately literal and import-free: changing the backup surface requires a
// reviewed SQL change, not identifiers supplied by a caller or catalog discovery.
export const CURRENT_BACKUP_TABLES = [
  "shagun.admin_users",
  "shagun.analytics_daily",
  "shagun.cities",
  "shagun.facilities",
  "shagun.media_assets",
  "shagun.rate_limits",
  "shagun.storage_cleanup_jobs",
  "shagun.venue_facilities",
  "shagun.venue_research",
  "shagun.venues",
  "shagun_private.schema_migrations",
] as const;

/**
 * One read-only statement for the current ordinary-table/SQL-routine surface.
 * OIDs are join/deparser inputs only, never snapshot identities or sort keys.
 * Enum positions and live-column positions preserve semantic order without
 * retaining enum allocation numbers or gaps left by dropped attributes.
 *
 * The caller must require exactly one snapshot row, use a read-only transaction
 * and consistent dump snapshot, and pin matching PostgreSQL 17 / UTF-8 sessions:
 * search_path=pg_catalog, TimeZone=UTC, DateStyle='ISO, YMD', IntervalStyle=postgres,
 * extra_float_digits=3, bytea_output=hex, standard_conforming_strings=on.
 * Set row_security=off in the caller to fail on filtering, not bypass RLS. The
 * SELECT also withholds a snapshot if any required table has active row security.
 * Schema/object owners and ACL role names (normally postgres and the three app
 * roles) must be restored, not rewritten to match this query.
 *
 * This is not a general cluster backup: no global role membership/settings or
 * global default privileges, Auth/Storage metadata, identities, object bytes,
 * sequence state, or extension definitions. An auth.users UUID reference stub
 * and the source's actual auth.uid definition belong to SQL restore orchestration;
 * their presence does not validate Auth claims. MD5 limb sums are regression
 * fingerprints, not authenticity/encryption; artifact integrity is external.
 */
export function currentBackupSnapshotSql(): string {
  return `
with expected_tables(schema_name, table_name) as (
  values
    ('shagun', 'admin_users'),
    ('shagun', 'analytics_daily'),
    ('shagun', 'cities'),
    ('shagun', 'facilities'),
    ('shagun', 'media_assets'),
    ('shagun', 'rate_limits'),
    ('shagun', 'storage_cleanup_jobs'),
    ('shagun', 'venue_facilities'),
    ('shagun', 'venue_research'),
    ('shagun', 'venues'),
    ('shagun_private', 'schema_migrations')
), namespaces as (
  select n.oid, n.nspname, n.nspowner, n.nspacl
  from pg_catalog.pg_namespace n
  where n.nspname in ('shagun', 'shagun_private')
), relations as (
  select c.*, pg_catalog.format('%I.%I', n.nspname, c.relname) as qualified_name
  from pg_catalog.pg_class c
  join namespaces n on n.oid = c.relnamespace
  join expected_tables e on e.schema_name = n.nspname and e.table_name = c.relname
  where c.relkind = 'r'
), attributes as (
  select a.*, pg_catalog.row_number() over (partition by a.attrelid order by a.attnum) as position
  from pg_catalog.pg_attribute a join relations r on r.oid = a.attrelid
  where a.attnum > 0 and not a.attisdropped
), routines as (
  select p.*, pg_catalog.format('%I.%I', n.nspname, p.proname) as qualified_name,
    pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_arguments
  from pg_catalog.pg_proc p join namespaces n on n.oid = p.pronamespace
  where p.prokind in ('f', 'p')
), scoped_types as (
  select t.*, pg_catalog.format('%I.%I', n.nspname, t.typname) as qualified_name
  from pg_catalog.pg_type t join namespaces n on n.oid = t.typnamespace
), schema_defaults as (
  select d.*, n.nspname::text as schema_name
  from pg_catalog.pg_default_acl d join namespaces n on n.oid = d.defaclnamespace
), role_names(role_id, name) as (
  select r.oid, r.rolname::text from pg_catalog.pg_roles r
  union all select 0::pg_catalog.oid, 'PUBLIC'::text
), acl_sources(kind, object_id, sub_id, acl) as (
  select 'schema', n.oid, 0, coalesce(n.nspacl, pg_catalog.acldefault('n', n.nspowner)) from namespaces n
  union all
  select 'relation', r.oid, 0, coalesce(r.relacl, pg_catalog.acldefault('r', r.relowner)) from relations r
  union all
  select 'column', a.attrelid, a.attnum, a.attacl from attributes a
  union all
  select 'routine', p.oid, 0, coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner)) from routines p
  union all
  select 'type', t.oid, 0, coalesce(t.typacl, pg_catalog.acldefault('T', t.typowner)) from scoped_types t
  union all
  select 'default', d.oid, 0, d.defaclacl from schema_defaults d
), named_acls as (
  select s.kind, s.object_id, s.sub_id,
    pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'grantor', grantor.name, 'grantee', grantee.name,
      'privilege', g.privilege_type, 'grantable', g.is_grantable)
      order by grantor.name collate "C", grantee.name collate "C",
        g.privilege_type collate "C", g.is_grantable) as value
  from acl_sources s
  -- Normalize AFTER resolving NULL object ACL defaults. An explicitly empty
  -- ACL has no grants; substituting acldefault here would invent privileges.
  -- NULL/empty column ACLs have no independent grants, not table ACL defaults.
  cross join lateral pg_catalog.aclexplode(nullif(s.acl, '{}'::pg_catalog.aclitem[])) g
  join role_names grantor on grantor.role_id = g.grantor
  join role_names grantee on grantee.role_id = g.grantee
  group by s.kind, s.object_id, s.sub_id
), constraint_metadata as (
  select k.conrelid as relation_id, k.contypid as type_id, k.conname::text as name,
    pg_catalog.jsonb_build_object(
      'name', k.conname, 'type', k.contype,
      'definition', pg_catalog.pg_get_constraintdef(k.oid, false),
      'deferrable', k.condeferrable, 'initiallyDeferred', k.condeferred,
      'validated', k.convalidated, 'noInherit', k.connoinherit) as value
  from pg_catalog.pg_constraint k
  where k.conrelid in (select r.oid from relations r)
    or k.contypid in (select t.oid from scoped_types t)
), row_hashes(table_name, h) as (
  select 'shagun.admin_users', pg_catalog.md5(pg_catalog.to_jsonb(entry)::text) from shagun.admin_users entry
  union all
  select 'shagun.analytics_daily', pg_catalog.md5(pg_catalog.to_jsonb(entry)::text) from shagun.analytics_daily entry
  union all
  select 'shagun.cities', pg_catalog.md5(pg_catalog.to_jsonb(entry)::text) from shagun.cities entry
  union all
  select 'shagun.facilities', pg_catalog.md5(pg_catalog.to_jsonb(entry)::text) from shagun.facilities entry
  union all
  select 'shagun.media_assets', pg_catalog.md5(pg_catalog.to_jsonb(entry)::text) from shagun.media_assets entry
  union all
  select 'shagun.rate_limits', pg_catalog.md5(pg_catalog.to_jsonb(entry)::text) from shagun.rate_limits entry
  union all
  select 'shagun.storage_cleanup_jobs', pg_catalog.md5(pg_catalog.to_jsonb(entry)::text) from shagun.storage_cleanup_jobs entry
  union all
  select 'shagun.venue_facilities', pg_catalog.md5(pg_catalog.to_jsonb(entry)::text) from shagun.venue_facilities entry
  union all
  select 'shagun.venue_research', pg_catalog.md5(pg_catalog.to_jsonb(entry)::text) from shagun.venue_research entry
  union all
  select 'shagun.venues', pg_catalog.md5(pg_catalog.to_jsonb(entry)::text) from shagun.venues entry
  union all
  select 'shagun_private.schema_migrations', pg_catalog.md5(pg_catalog.to_jsonb(entry)::text) from shagun_private.schema_migrations entry
), fingerprints as (
  -- Only eleven aggregate states, not row arrays, reach the JSON projection.
  select table_name, pg_catalog.count(*)::text as count,
    pg_catalog.md5(pg_catalog.count(*)::text || ':' ||
      coalesce(pg_catalog.sum(('x' || pg_catalog.substr(h, 1, 8))::bit(32)::bigint), 0)::text || ':' ||
      coalesce(pg_catalog.sum(('x' || pg_catalog.substr(h, 9, 8))::bit(32)::bigint), 0)::text || ':' ||
      coalesce(pg_catalog.sum(('x' || pg_catalog.substr(h, 17, 8))::bit(32)::bigint), 0)::text || ':' ||
      coalesce(pg_catalog.sum(('x' || pg_catalog.substr(h, 25, 8))::bit(32)::bigint), 0)::text) as digest
  from row_hashes group by table_name
)
select pg_catalog.jsonb_build_object(
  'data', (select pg_catalog.jsonb_object_agg(e.schema_name || '.' || e.table_name,
    pg_catalog.jsonb_build_object('count', coalesce(f.count, '0'),
      'digest', coalesce(f.digest, pg_catalog.md5('0:0:0:0:0')))
    order by e.schema_name collate "C", e.table_name collate "C")
    from expected_tables e left join fingerprints f on f.table_name = e.schema_name || '.' || e.table_name),
  'metadata', pg_catalog.jsonb_build_object(
    'schemas', (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'name', n.nspname, 'owner', owner.name, 'acl', coalesce(acl.value, '[]'::jsonb))
      order by n.nspname collate "C")
      from namespaces n join role_names owner on owner.role_id = n.nspowner
      left join named_acls acl on acl.kind = 'schema' and acl.object_id = n.oid and acl.sub_id = 0),
    'relations', (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'name', r.qualified_name, 'owner', owner.name, 'kind', r.relkind,
      'persistence', r.relpersistence, 'replicaIdentity', r.relreplident,
      'rls', r.relrowsecurity, 'forceRls', r.relforcerowsecurity,
      'acl', coalesce(acl.value, '[]'::jsonb),
      'options', (select coalesce(pg_catalog.jsonb_agg(o.value order by o.value collate "C"), '[]'::jsonb)
        from pg_catalog.unnest(r.reloptions) o(value)),
      'columns', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'name', a.attname, 'position', a.position,
        'type', pg_catalog.format('%I.%I', tn.nspname, t.typname),
        'formattedType', pg_catalog.format_type(a.atttypid, a.atttypmod),
        'typeModifier', a.atttypmod, 'dimensions', a.attndims,
        'notNull', a.attnotnull, 'identity', a.attidentity, 'generated', a.attgenerated,
        'collation', case when co.oid is not null then pg_catalog.format('%I.%I', cn.nspname, co.collname) end,
        'default', pg_catalog.pg_get_expr(d.adbin, d.adrelid, false),
        'acl', coalesce(ca.value, '[]'::jsonb)) order by a.attname collate "C"), '[]'::jsonb)
        from attributes a
        join pg_catalog.pg_type t on t.oid = a.atttypid
        join pg_catalog.pg_namespace tn on tn.oid = t.typnamespace
        left join pg_catalog.pg_collation co on co.oid = a.attcollation
        left join pg_catalog.pg_namespace cn on cn.oid = co.collnamespace
        left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
        left join named_acls ca on ca.kind = 'column' and ca.object_id = a.attrelid and ca.sub_id = a.attnum
        where a.attrelid = r.oid),
      'constraints', (select coalesce(pg_catalog.jsonb_agg(k.value order by k.name collate "C"), '[]'::jsonb)
        from constraint_metadata k where k.relation_id = r.oid),
      'indexes', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'name', ic.relname, 'owner', io.name, 'definition', pg_catalog.pg_get_indexdef(i.indexrelid),
        'valid', i.indisvalid, 'ready', i.indisready, 'live', i.indislive,
        'clustered', i.indisclustered, 'replicaIdentity', i.indisreplident,
        'options', (select coalesce(pg_catalog.jsonb_agg(o.value order by o.value collate "C"), '[]'::jsonb)
          from pg_catalog.unnest(ic.reloptions) o(value))) order by ic.relname collate "C"), '[]'::jsonb)
        from pg_catalog.pg_index i join pg_catalog.pg_class ic on ic.oid = i.indexrelid
        join role_names io on io.role_id = ic.relowner where i.indrelid = r.oid),
      'triggers', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'name', t.tgname, 'enabled', t.tgenabled,
        'function', pg_catalog.format('%I.%I(%s)', fn.nspname, f.proname,
          pg_catalog.pg_get_function_identity_arguments(f.oid)),
        'definition', pg_catalog.pg_get_triggerdef(t.oid, false)) order by t.tgname collate "C"), '[]'::jsonb)
        from pg_catalog.pg_trigger t join pg_catalog.pg_proc f on f.oid = t.tgfoid
        join pg_catalog.pg_namespace fn on fn.oid = f.pronamespace
        where t.tgrelid = r.oid and not t.tgisinternal),
      'policies', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'name', p.polname, 'permissive', p.polpermissive, 'command', p.polcmd,
        'roles', (select coalesce(pg_catalog.jsonb_agg(role.name order by role.name collate "C"), '[]'::jsonb)
          from pg_catalog.unnest(p.polroles) member(role_id) join role_names role on role.role_id = member.role_id),
        'using', pg_catalog.pg_get_expr(p.polqual, p.polrelid, false),
        'check', pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid, false)) order by p.polname collate "C"), '[]'::jsonb)
        from pg_catalog.pg_policy p where p.polrelid = r.oid)
      ) order by r.qualified_name collate "C")
      from relations r join role_names owner on owner.role_id = r.relowner
      left join named_acls acl on acl.kind = 'relation' and acl.object_id = r.oid and acl.sub_id = 0),
    'routines', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'name', p.qualified_name, 'signature', p.qualified_name || '(' || p.identity_arguments || ')',
      'identityArguments', p.identity_arguments, 'arguments', pg_catalog.pg_get_function_arguments(p.oid),
      'result', pg_catalog.pg_get_function_result(p.oid),
      'returnType', pg_catalog.format('%I.%I', rtn.nspname, rt.typname),
      'kind', p.prokind, 'owner', owner.name, 'language', l.lanname,
      'definer', p.prosecdef, 'strict', p.proisstrict, 'volatility', p.provolatile,
      'leakproof', p.proleakproof, 'parallel', p.proparallel, 'returnsSet', p.proretset,
      'cost', p.procost, 'rows', p.prorows,
      'configuration', (select coalesce(pg_catalog.jsonb_agg(s.value order by s.value collate "C"), '[]'::jsonb)
        from pg_catalog.unnest(p.proconfig) s(value)),
      'acl', coalesce(acl.value, '[]'::jsonb), 'definition', pg_catalog.pg_get_functiondef(p.oid))
      order by p.qualified_name collate "C", p.identity_arguments collate "C"), '[]'::jsonb)
      from routines p join role_names owner on owner.role_id = p.proowner
      join pg_catalog.pg_language l on l.oid = p.prolang
      join pg_catalog.pg_type rt on rt.oid = p.prorettype
      join pg_catalog.pg_namespace rtn on rtn.oid = rt.typnamespace
      left join named_acls acl on acl.kind = 'routine' and acl.object_id = p.oid and acl.sub_id = 0),
    'types', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'name', t.qualified_name, 'kind', t.typtype, 'category', t.typcategory, 'owner', owner.name,
      'baseType', case when bt.oid is not null then pg_catalog.format('%I.%I', bn.nspname, bt.typname) end,
      'elementType', case when et.oid is not null then pg_catalog.format('%I.%I', en.nspname, et.typname) end,
      'arrayType', case when array_type.oid is not null then pg_catalog.format('%I.%I', an.nspname, array_type.typname) end,
      'relation', case when tr.oid is not null then pg_catalog.format('%I.%I', rn.nspname, tr.relname) end,
      'typeModifier', t.typtypmod, 'dimensions', t.typndims, 'notNull', t.typnotnull,
      'collation', case when co.oid is not null then pg_catalog.format('%I.%I', cn.nspname, co.collname) end,
      'default', case when t.typdefaultbin is null then t.typdefault
        else pg_catalog.pg_get_expr(t.typdefaultbin, 0::pg_catalog.oid, false) end,
      'acl', coalesce(acl.value, '[]'::jsonb),
      'labels', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'name', e.enumlabel, 'position', e.position) order by e.enumlabel collate "C"), '[]'::jsonb)
        from (select pe.enumlabel, pg_catalog.row_number() over (order by pe.enumsortorder) as position
          from pg_catalog.pg_enum pe where pe.enumtypid = t.oid) e),
      'constraints', (select coalesce(pg_catalog.jsonb_agg(k.value order by k.name collate "C"), '[]'::jsonb)
        from constraint_metadata k where k.type_id = t.oid)) order by t.qualified_name collate "C"), '[]'::jsonb)
      from scoped_types t join role_names owner on owner.role_id = t.typowner
      left join pg_catalog.pg_type bt on bt.oid = t.typbasetype
      left join pg_catalog.pg_namespace bn on bn.oid = bt.typnamespace
      left join pg_catalog.pg_type et on et.oid = t.typelem
      left join pg_catalog.pg_namespace en on en.oid = et.typnamespace
      left join pg_catalog.pg_type array_type on array_type.oid = t.typarray
      left join pg_catalog.pg_namespace an on an.oid = array_type.typnamespace
      left join pg_catalog.pg_class tr on tr.oid = t.typrelid
      left join pg_catalog.pg_namespace rn on rn.oid = tr.relnamespace
      left join pg_catalog.pg_collation co on co.oid = t.typcollation
      left join pg_catalog.pg_namespace cn on cn.oid = co.collnamespace
      left join named_acls acl on acl.kind = 'type' and acl.object_id = t.oid and acl.sub_id = 0),
    'defaultPrivileges', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'schema', d.schema_name, 'role', owner.name, 'type', d.defaclobjtype,
      'acl', coalesce(acl.value, '[]'::jsonb))
      order by d.schema_name collate "C", owner.name collate "C", d.defaclobjtype::text collate "C"), '[]'::jsonb)
      from schema_defaults d join role_names owner on owner.role_id = d.defaclrole
      left join named_acls acl on acl.kind = 'default' and acl.object_id = d.oid and acl.sub_id = 0)
  )
)::text as snapshot
where (select pg_catalog.count(*) from namespaces) = 2
  and (select pg_catalog.count(*) from relations) = 11
  and not exists (select 1 from relations r where pg_catalog.row_security_active(r.oid));
`;
}