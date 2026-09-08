import { STORAGE_POLICIES } from "./db-migration-plan";

export type ManagedSchema = "public" | "auth" | "storage";

// Only checked-in catalog expressions can enter SQL text. Schema names, flags
// and the reserved policy names are bound values, never SQL identifiers/input.
const ACL_EXPRESSIONS = {
  schema: "coalesce(n.nspacl, pg_catalog.acldefault('n', n.nspowner))",
  relation: "coalesce(c.relacl, pg_catalog.acldefault(case when c.relkind = 'S' then 's'::\"char\" else 'r'::\"char\" end, c.relowner))",
  column: "a.attacl",
  type: "coalesce(t.typacl, pg_catalog.acldefault('T', t.typowner))",
  routine: "coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))",
  defaultPrivileges: "d.defaclacl",
} as const;

function acl(kind: keyof typeof ACL_EXPRESSIONS): string {
  // aclexplode('{}'::aclitem[]) raises 22023: an empty array has zero dimensions.
  // NULL yields no rows. Normalize only empty ACLs, AFTER resolving defaults:
  // an explicit empty object ACL must not acquire its owner's default grants.
  // Columns have no implicit ACL; their table's privileges are captured above.
  return `(select coalesce(jsonb_agg(jsonb_build_object(
    'grantor', g.grantor::text, 'grantee', g.grantee::text,
    'privilege', g.privilege_type, 'grantable', g.is_grantable)
    order by g.grantor, g.grantee, g.privilege_type, g.is_grantable), '[]'::jsonb)
    from pg_catalog.aclexplode(nullif(${ACL_EXPRESSIONS[kind]}, '{}'::pg_catalog.aclitem[])) g)`;
}

// Pure query builder: importing it cannot run the CLI or open a connection.
// Both postgres.js and the isolated PGlite regression execute this exact SQL.
export function metadataSnapshotQuery(schema: ManagedSchema, newStorage: boolean, newInventory: boolean) {
  // Logical metadata only: no reltuples/pages/statistics, Auth records, function
  // bodies, role passwords/config blobs or arbitrary settings. Owners/grantees
  // are OIDs, not login names. The JSON is deterministic and NEVER logged/saved.
  const text = `
    select jsonb_build_object(
      'schema', jsonb_build_object('name', n.nspname, 'owner', n.nspowner::text,
        'acl', ${acl("schema")}),
      'relations', (select coalesce(jsonb_agg(jsonb_build_object(
        'name', c.relname, 'kind', c.relkind, 'owner', c.relowner::text,
        'persistence', c.relpersistence, 'rls', c.relrowsecurity, 'forceRls', c.relforcerowsecurity,
        'replicaIdentity', c.relreplident, 'partition', c.relispartition,
        'partitionBound', pg_get_expr(c.relpartbound, c.oid),
        'options', (select coalesce(jsonb_agg(o order by o collate "C"), '[]'::jsonb) from unnest(c.reloptions) o),
        'acl', ${acl("relation")},
        'view', case when c.relkind in ('v', 'm') then pg_get_viewdef(c.oid, false) else null end,
        'parents', (select coalesce(jsonb_agg(i.inhparent::text order by i.inhseqno), '[]'::jsonb)
          from pg_inherits i where i.inhrelid = c.oid),
        'columns', (select coalesce(jsonb_agg(jsonb_build_object(
          'position', a.attnum, 'name', a.attname, 'type', format_type(a.atttypid, a.atttypmod),
          'typeOid', a.atttypid::text, 'typeModifier', a.atttypmod, 'collation', a.attcollation::text,
          'notNull', a.attnotnull, 'identity', a.attidentity, 'generated', a.attgenerated,
          'storage', a.attstorage, 'compression', a.attcompression, 'inherited', a.attinhcount,
          'default', pg_get_expr(d.adbin, d.adrelid),
          'acl', ${acl("column")}) order by a.attnum), '[]'::jsonb)
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
            $3::boolean and n.nspname = 'auth' and c.relname = 'users' and t.tgisinternal
            and exists (select 1 from pg_constraint fk where fk.oid = t.tgconstraint
              and fk.contype = 'f' and fk.conname = 'admin_users_id_fkey'
              and fk.conrelid = to_regclass('shagun.admin_users') and fk.confrelid = c.oid
              and t.tgconstrrelid = fk.conrelid))),
        'policies', (select coalesce(jsonb_agg(jsonb_build_object(
          'name', p.polname, 'command', p.polcmd, 'permissive', p.polpermissive,
          'roles', (select jsonb_agg(r::text order by r) from unnest(p.polroles) r),
          'using', pg_get_expr(p.polqual, p.polrelid), 'check', pg_get_expr(p.polwithcheck, p.polrelid))
          order by p.polname collate "C"), '[]'::jsonb) from pg_policy p where p.polrelid = c.oid
          and not ($2::boolean and n.nspname = 'storage' and c.relname = 'objects'
            and p.polname::text in (${STORAGE_POLICIES.map((_, index) => `$${index + 4}::text`).join(", ")})))
        ) order by c.relname collate "C"), '[]'::jsonb)
        from pg_class c where c.relnamespace = n.oid and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')),
      'types', (select coalesce(jsonb_agg(jsonb_build_object(
        'name', t.typname, 'kind', t.typtype, 'owner', t.typowner::text,
        'baseType', t.typbasetype::text, 'notNull', t.typnotnull, 'default', t.typdefault,
        'acl', ${acl("type")},
        'labels', (select jsonb_agg(e.enumlabel order by e.enumsortorder) from pg_enum e where e.enumtypid = t.oid))
        order by t.typname collate "C"), '[]'::jsonb) from pg_type t where t.typnamespace = n.oid),
      'routines', (select coalesce(jsonb_agg(jsonb_build_object(
        'name', p.proname, 'arguments', pg_get_function_identity_arguments(p.oid),
        'result', pg_get_function_result(p.oid), 'kind', p.prokind, 'owner', p.proowner::text,
        'definer', p.prosecdef, 'volatility', p.provolatile, 'leakproof', p.proleakproof,
        'strict', p.proisstrict, 'acl', ${acl("routine")})
        order by p.proname collate "C", p.oid), '[]'::jsonb) from pg_proc p where p.pronamespace = n.oid),
      'defaultPrivileges', (select coalesce(jsonb_agg(jsonb_build_object(
        'role', d.defaclrole::text, 'namespace', d.defaclnamespace::text, 'type', d.defaclobjtype,
        'acl', ${acl("defaultPrivileges")}) order by d.defaclrole, d.defaclnamespace, d.defaclobjtype), '[]'::jsonb)
        from pg_default_acl d where d.defaclnamespace in (0, n.oid)),
      'roleMemberships', (select coalesce(jsonb_agg(to_jsonb(m) order by m.roleid, m.member, m.grantor), '[]'::jsonb) from pg_auth_members m),
      'roleCapabilities', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.oid::text, 'superuser', r.rolsuper, 'inherit', r.rolinherit, 'bypassRls', r.rolbypassrls)
        order by r.oid), '[]'::jsonb) from pg_roles r)
    )::text as snapshot
    from pg_namespace n where n.nspname = $1::text
  `;
  return { text, parameters: [schema, newStorage, newInventory, ...STORAGE_POLICIES] };
}