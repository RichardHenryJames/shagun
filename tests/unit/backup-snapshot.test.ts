import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  createSourceFile, isArrayLiteralExpression, isAsExpression, isFunctionDeclaration,
  isNoSubstitutionTemplateLiteral, isReturnStatement, isStringLiteral, isVariableStatement, ScriptTarget,
} from "typescript";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { CURRENT_BACKUP_TABLES, currentBackupSnapshotSql } from "../../scripts/db-backup-snapshot";
import { SHAGUN_TABLES, sqlStatements, type Fingerprint } from "../../scripts/db-migration-plan";

// Synthetic SQL catalogs/data in two independent, memory-only PostgreSQL engines.
// No executable backup runner, environment files, sockets, containers, extension
// installation, managed Auth or JWT-validation probes. The one source-file read
// checks that the helper remains literal and free of module-load effects.
vi.mock("postgres", () => { throw new Error("External databases are forbidden in backup snapshot tests."); });

type Named = { name: string };
type Grant = { grantor: string; grantee: string; privilege: string; grantable: boolean };
type Constraint = Named & {
  type: string; definition: string; deferrable: boolean; initiallyDeferred: boolean; validated: boolean;
};
type Column = Named & {
  position: number; type: string; formattedType: string; typeModifier: number; dimensions: number;
  notNull: boolean; identity: string; generated: string; collation: string | null; default: string | null; acl: Grant[];
};
type Relation = Named & {
  owner: string; acl: Grant[]; rls: boolean; forceRls: boolean; options: string[]; columns: Column[];
  constraints: Constraint[];
  indexes: (Named & { owner: string; definition: string; options: string[] })[];
  triggers: (Named & { function: string; enabled: string; definition: string })[];
  policies: (Named & { permissive: boolean; command: string; roles: string[]; using: string | null; check: string | null })[];
};
type Routine = Named & {
  signature: string; identityArguments: string; arguments: string; result: string | null; returnType: string;
  owner: string; language: string; kind: string; definer: boolean; strict: boolean; volatility: string;
  parallel: string; configuration: string[]; acl: Grant[]; definition: string;
};
type CatalogType = Named & {
  owner: string; kind: string; baseType: string | null; elementType: string | null; arrayType: string | null;
  relation: string | null; notNull: boolean; default: string | null; collation: string | null; acl: Grant[];
  labels: (Named & { position: number })[]; constraints: Constraint[];
};
type Snapshot = {
  data: Record<typeof CURRENT_BACKUP_TABLES[number], Fingerprint>;
  metadata: {
    schemas: (Named & { owner: string; acl: Grant[] })[];
    relations: Relation[]; routines: Routine[]; types: CatalogType[];
    defaultPrivileges: { schema: string; role: string; type: string; acl: Grant[] }[];
  };
};

const APP_ROLES = ["anon", "authenticated", "service_role"] as const;
const FIRST_ID = "10000000-0000-4000-8000-000000000001";
const SECOND_ID = "10000000-0000-4000-8000-000000000002";
const PRIVATE_ALPHA = "SYNTHETIC_PRIVATE_ROW_ALPHA";
const PRIVATE_BETA = "SYNTHETIC_PRIVATE_ROW_BETA";
const EMPTY_DIGEST = createHash("md5").update("0:0:0:0:0").digest("hex");
const SESSION_SETTINGS = `
  set local search_path = pg_catalog;
  set local timezone = 'UTC';
  set local datestyle = 'ISO, YMD';
  set local intervalstyle = 'postgres';
  set local extra_float_digits = 3;
  set local bytea_output = 'hex';
  set local standard_conforming_strings = on;
  set local row_security = off;
`;
let source: PGlite;
let restored: PGlite;
let helperSource: string;

function named<T extends Named>(entries: readonly T[], name: string): T {
  const entry = entries.find((candidate) => candidate.name === name);
  if (!entry) throw new Error(`Missing synthetic snapshot object: ${name}`);
  return entry;
}

async function snapshot(database: PGlite = source): Promise<{ text: string; value: Snapshot }> {
  const result = await database.query<{ snapshot: string }>(currentBackupSnapshotSql());
  expect(result.rows).toHaveLength(1);
  expect(Object.keys(result.rows[0])).toEqual(["snapshot"]);
  const text = result.rows[0].snapshot;
  expect(typeof text).toBe("string");
  return { text, value: JSON.parse(text) as Snapshot };
}

async function bootstrap(database: PGlite, shiftOids: boolean): Promise<void> {
  if (shiftOids) await database.exec(`
    create role synthetic_noise_reader nologin;
    create role synthetic_noise_writer nologin;
    create schema synthetic_noise;
    create type synthetic_noise.extra_enum as enum ('one', 'two');
    create domain synthetic_noise.extra_domain as integer check (value >= 0);
    create type synthetic_noise.extra_pair as (label text, quantity integer);
    create collation synthetic_noise.extra_collation from pg_catalog."C";
    create function synthetic_noise.extra_function() returns integer language sql as $$ select 1 $$;
  `);
  // Reverse role and overload creation as well as shifting allocations. Merely
  // adding a constant OID offset would not catch sorting by role/function OID.
  const roles = shiftOids ? [...APP_ROLES].reverse() : [...APP_ROLES];
  for (const role of roles) await database.exec(`create role ${role} nologin nosuperuser ${role === "service_role" ? "bypassrls" : "nobypassrls"}`);
  await database.exec(`
    create schema auth authorization postgres;
    create table auth.users (id uuid primary key);
    insert into auth.users values ('${FIRST_ID}'), ('${SECOND_ID}');
    create schema shagun authorization postgres;
    create schema shagun_private authorization postgres;
    create collation shagun.synthetic_binary from pg_catalog."C";
    create type shagun.synthetic_status as enum ('z_draft', 'A_active');
    create domain shagun.synthetic_nonempty as text collate pg_catalog."C"
      default 'fixture' not null constraint synthetic_nonempty_check check (value <> '');
  `);
  // Only the checked-in table-name constants form these local fixture identifiers.
  // gen_random_uuid, JSONB, tsvector/GIN and SQL/plpgsql need no optional extension.
  for (const table of SHAGUN_TABLES) {
    await database.exec(`create table shagun.${table} (
      id uuid primary key default pg_catalog.gen_random_uuid(),
      payload text collate shagun.synthetic_binary not null default '',
      quantity numeric(12, 2) not null default 1.00 check (quantity >= 0),
      details jsonb not null default '{}'::jsonb,
      changed_at timestamptz not null default pg_catalog.transaction_timestamp()
    )`);
    await database.query(`insert into shagun.${table} (id, payload, quantity, details, changed_at) values
      ($1, $2, 1.25, '{"z":2,"a":null}', '2026-09-09 01:02:03.123456+00'),
      ($3, $4, 9.50, '{"a":[1,true],"z":"हिंदी"}', '2026-09-08 23:59:59.654321+00')`,
    [FIRST_ID, PRIVATE_ALPHA, SECOND_ID, PRIVATE_BETA]);
  }
  await database.exec(`
    create table shagun_private.schema_migrations (
      version text primary key, checksum text not null,
      applied_at timestamptz not null default pg_catalog.transaction_timestamp()
    );
    insert into shagun_private.schema_migrations values
      ('0001', repeat('a', 64), '2026-09-09 01:02:03.123456+00'),
      ('0002', repeat('b', 64), '2026-09-09 01:02:04.654321+00');
    alter table shagun.admin_users add constraint admin_users_id_fkey
      foreign key (id) references auth.users(id) on delete cascade;
    alter table shagun.venues add column city_id uuid;
    alter table shagun.venues add constraint venues_city_fkey foreign key (city_id)
      references shagun.cities(id) on delete restrict deferrable initially deferred;
    alter table shagun.cities
      add column status shagun.synthetic_status not null default 'z_draft',
      add column alias shagun.synthetic_nonempty not null default 'fixture',
      add column ordinal bigint generated by default as identity,
      add column search_document tsvector generated always as
        (to_tsvector('pg_catalog.simple'::regconfig, payload)) stored;
    alter table shagun.cities add constraint cities_quantity_unvalidated check (quantity < 1000) not valid;
    create index synthetic_partial_idx on shagun.cities (lower(payload)) where quantity > 0;
    create index synthetic_search_idx on shagun.cities using gin (search_document);
    create function shagun_private.synthetic_before() returns trigger
      language plpgsql security definer set search_path = '' as $$ begin return new; end; $$;
    create trigger synthetic_before before insert or update on shagun.cities
      for each row execute function shagun_private.synthetic_before();
    create function shagun.synthetic_document(p_city shagun.cities, p_public boolean default false)
      returns jsonb language sql stable set search_path = '' as $$
        select pg_catalog.jsonb_build_object('id', (p_city).id, 'public', p_public);
      $$;
  `);
  const overloads = [
    `create function shagun.synthetic_echo(p_value text default 'fallback') returns text
      language sql immutable strict parallel safe set search_path = '' as $$ select p_value $$`,
    `create function shagun.synthetic_echo(p_value integer default 0) returns integer
      language sql immutable strict parallel safe set search_path = '' as $$ select p_value $$`,
  ];
  for (const ddl of shiftOids ? [...overloads].reverse() : overloads) await database.exec(ddl);
  await database.exec(`
    revoke all on schema shagun, shagun_private from public, anon, authenticated, service_role;
    grant usage on schema shagun, shagun_private to ${roles.join(", ")};
    grant all on all tables in schema shagun to service_role;
    grant select on shagun.cities to ${shiftOids ? "authenticated, anon" : "anon, authenticated"};
    grant select (payload) on shagun.venue_research to authenticated;
    grant update (payload) on shagun.venue_research to authenticated with grant option;
    revoke all on all functions in schema shagun, shagun_private from public, anon, authenticated, service_role;
    grant execute on function shagun.synthetic_echo(text) to authenticated;
    alter table shagun.cities enable row level security;
    alter table shagun.cities force row level security;
    create policy "z_public" on shagun.cities for select to public using (quantity >= 0);
    create policy "A_read" on shagun.cities for select to ${roles.join(", ")} using (quantity > 0);
    create policy "a_update" on shagun.cities as restrictive for update to authenticated
      using (quantity > 0) with check (quantity > 0);
    alter default privileges for role postgres in schema shagun grant select on tables to anon;
    alter default privileges for role postgres in schema shagun_private grant execute on functions to authenticated;
  `);
}

beforeAll(async () => {
  helperSource = await readFile(new URL("../../scripts/db-backup-snapshot.ts", import.meta.url), "utf8");
  source = new PGlite();
  restored = new PGlite();
  await bootstrap(source, false);
  await bootstrap(restored, true);
});
beforeEach(async () => {
  await source.exec(`begin; ${SESSION_SETTINGS}`);
  await restored.exec(`begin; ${SESSION_SETTINGS}`);
});
afterEach(async () => {
  await source.exec("rollback");
  await restored.exec("rollback");
});
afterAll(async () => {
  await source?.close();
  await restored?.close();
});

describe("fixed, local-only backup snapshot contract", () => {
  it("exports exactly the eleven reviewed qualified tables and a parameterless string function", () => {
    expect(CURRENT_BACKUP_TABLES).toEqual([...SHAGUN_TABLES.map((name) => `shagun.${name}`), "shagun_private.schema_migrations"]);
    expect(CURRENT_BACKUP_TABLES).toHaveLength(11);
    expect(new Set(CURRENT_BACKUP_TABLES).size).toBe(11);
    expectTypeOf<typeof CURRENT_BACKUP_TABLES>().toMatchTypeOf<readonly string[]>();
    expectTypeOf<typeof CURRENT_BACKUP_TABLES>().toEqualTypeOf<Readonly<typeof CURRENT_BACKUP_TABLES>>();
    expectTypeOf(currentBackupSnapshotSql).toEqualTypeOf<() => string>();
    expect(currentBackupSnapshotSql.length).toBe(0);
  });

  it("has only a literal table list and a literal SQL return, with no imports or module effects", () => {
    const file = createSourceFile("db-backup-snapshot.ts", helperSource, ScriptTarget.Latest, true);
    expect(file.statements).toHaveLength(2);
    const list = file.statements[0];
    const fn = file.statements[1];
    if (!isVariableStatement(list) || !isFunctionDeclaration(fn)) throw new Error("Nonliteral helper module.");
    expect(list.declarationList.declarations).toHaveLength(1);
    const declaration = list.declarationList.declarations[0];
    expect(declaration.name.getText(file)).toBe("CURRENT_BACKUP_TABLES");
    const initializer = declaration.initializer;
    if (!initializer || !isAsExpression(initializer) || !isArrayLiteralExpression(initializer.expression)) {
      throw new Error("Backup tables must remain a checked-in readonly literal.");
    }
    expect(initializer.expression.elements.map((element) => {
      if (!isStringLiteral(element)) throw new Error("Dynamic backup table identifier.");
      return element.text;
    })).toEqual(CURRENT_BACKUP_TABLES);
    expect(fn.name?.text).toBe("currentBackupSnapshotSql");
    expect(fn.parameters).toHaveLength(0);
    expect(fn.body?.statements).toHaveLength(1);
    const statement = fn.body?.statements[0];
    if (!statement || !isReturnStatement(statement) || !statement.expression
        || !isNoSubstitutionTemplateLiteral(statement.expression)) throw new Error("Snapshot SQL must be a single fixed literal.");
    expect(statement.expression.text.replace(/\r\n/g, "\n")).toBe(currentBackupSnapshotSql());
  });

  it("contains one SELECT statement with exact data scopes and no writable or dynamic SQL surface", () => {
    const sql = currentBackupSnapshotSql();
    const statements = sqlStatements(sql);
    expect(statements).toHaveLength(1);
    expect(statements[0].code).toMatch(/^with\b/);
    expect(statements[0].bodies).toEqual([]);
    expect(statements[0].code).not.toMatch(/\b(?:insert|update|delete|merge|create|alter|drop|truncate|copy|call|do|execute|set|reset|grant|revoke|lock|vacuum|analyze|nextval|setval|set_config|pg_read_file|pg_read_binary_file|dblink|query_to_xml)\b/);
    expect(sql).not.toMatch(/\$\d+|\$\{/);
    expect(sql).not.toMatch(/\b(?:from|join)\s+(?:public|auth|storage)\./i);
    expect(sql).not.toMatch(/\bpg_auth_members\b|\brolconfig\b|\brolpassword\b/);
    const dataReads = [...sql.matchAll(/\bfrom\s+((?:shagun|shagun_private)\.[a-z_]+)\s+entry\b/g)].map((match) => match[1]);
    expect(dataReads).toEqual(CURRENT_BACKUP_TABLES);
    expect(sql.match(/pg_catalog\.to_jsonb\(entry\)::text/g)).toHaveLength(11);
    expect(sql).not.toMatch(/(?:jsonb?_agg|array_agg)\s*\(\s*(?:entry|h|pg_catalog\.to_jsonb)/i);
    expect(sql).toContain("where n.nspname in ('shagun', 'shagun_private')");
    expect(sql).toContain("and not t.tgisinternal");
  });

  it("runs unchanged in a read-only transaction and returns only fingerprints plus scoped metadata", async () => {
    await source.exec("set transaction read only");
    const first = await snapshot();
    expect((await snapshot()).text === first.text).toBe(true);
    expect(Object.keys(first.value).sort()).toEqual(["data", "metadata"]);
    expect(Object.keys(first.value.data).sort()).toEqual([...CURRENT_BACKUP_TABLES].sort());
    expect(first.value.metadata.relations.map((relation) => relation.name)).toEqual(CURRENT_BACKUP_TABLES);
    for (const fingerprint of Object.values(first.value.data)) {
      expect(Object.keys(fingerprint).sort()).toEqual(["count", "digest"]);
      expect(fingerprint.count).toBe("2");
      expect(fingerprint.digest).toMatch(/^[a-f0-9]{32}$/);
    }
    for (const privateValue of [PRIVATE_ALPHA, PRIVATE_BETA, FIRST_ID, SECOND_ID, "a".repeat(64)]) {
      expect(first.text.includes(privateValue)).toBe(false);
    }
  });

  it("fails rather than inventing an empty fingerprint when a required table is missing", async () => {
    await source.exec("drop table shagun_private.schema_migrations");
    await expect(source.query(currentBackupSnapshotSql())).rejects.toMatchObject({ code: "42P01" });
  });

  it("does not return a successful snapshot to an RLS-filtered reader", async () => {
    await source.exec(`grant select on all tables in schema shagun, shagun_private to authenticated;
      set local role authenticated; set local row_security = on`);
    expect((await source.query(currentBackupSnapshotSql())).rows).toEqual([]);
  });
});

describe("all-row fingerprints", () => {
  it.each(CURRENT_BACKUP_TABLES)("detects edits, deletions and an empty %s without disclosing its rows", async (table) => {
    const before = (await snapshot()).value;
    const ledger = table === "shagun_private.schema_migrations";
    await source.exec(ledger
      ? "update shagun_private.schema_migrations set checksum = repeat('c', 64) where version = '0001'"
      : `update ${table} set payload = 'SYNTHETIC_CHANGED_PRIVATE_ROW' where id = '${FIRST_ID}'`);
    const edited = (await snapshot()).value;
    expect(edited.data[table].count).toBe("2");
    expect(edited.data[table].digest).not.toBe(before.data[table].digest);
    await source.exec(ledger
      ? "delete from shagun_private.schema_migrations where version = '0001'"
      : `delete from ${table} where id = '${FIRST_ID}'`);
    const deleted = (await snapshot()).value;
    expect(deleted.data[table].count).toBe("1");
    expect(deleted.data[table].digest).not.toBe(edited.data[table].digest);
    await source.exec(`delete from ${table}`);
    const empty = (await snapshot()).value;
    expect(empty.data[table]).toEqual({ count: "0", digest: EMPTY_DIGEST });
    for (const state of [edited, deleted, empty]) {
      expect(JSON.stringify(state.metadata) === JSON.stringify(before.metadata)).toBe(true);
      for (const other of CURRENT_BACKUP_TABLES) if (other !== table) expect(state.data[other]).toEqual(before.data[other]);
    }
  });

  it("does not depend on row scan/insertion order", async () => {
    const before = await snapshot();
    await source.exec(`create temporary table reordered as select * from shagun.facilities;
      delete from shagun.facilities;
      insert into shagun.facilities select * from reordered order by id desc`);
    expect((await snapshot()).text === before.text).toBe(true);
  });
});

describe("portable named metadata", () => {
  it("matches byte-for-byte across independent databases with different role, namespace, type, collation and routine OIDs", async () => {
    const probe = `select
      (select oid::text from pg_catalog.pg_roles where rolname = 'anon') as role,
      'shagun'::regnamespace::oid::text as namespace,
      'shagun.synthetic_status'::regtype::oid::text as type,
      (select oid::text from pg_catalog.pg_collation where collname = 'synthetic_binary'
        and collnamespace = 'shagun'::regnamespace) as collation,
      'shagun.synthetic_echo(text)'::regprocedure::oid::text as routine,
      (select tgname::text from pg_catalog.pg_trigger where tgrelid = 'shagun.admin_users'::regclass
        and tgisinternal order by tgname collate "C" limit 1) as internal_trigger`;
    const left = (await source.query<Record<string, string>>(probe)).rows[0];
    const right = (await restored.query<Record<string, string>>(probe)).rows[0];
    expect(source).not.toBe(restored);
    for (const key of Object.keys(left)) expect(left[key], key).not.toBe(right[key]);
    const first = await snapshot(source);
    const second = await snapshot(restored);
    expect(first.text === second.text).toBe(true);
    expect(first.value.metadata.relations.flatMap((relation) => relation.triggers)
      .some((trigger) => trigger.name.startsWith("RI_ConstraintTrigger"))).toBe(false);
  });

  it("retains schema/relation ownership, effective ACLs, typed columns and qualified collations", async () => {
    const metadata = (await snapshot()).value.metadata;
    expect(metadata.schemas.map((schema) => schema.name)).toEqual(["shagun", "shagun_private"]);
    for (const schema of metadata.schemas) {
      expect(schema.owner).toBe("postgres");
      for (const role of APP_ROLES) expect(schema.acl).toContainEqual({ grantor: "postgres", grantee: role, privilege: "USAGE", grantable: false });
    }
    expect(metadata.relations.every((relation) => relation.owner === "postgres")).toBe(true);
    const city = named(metadata.relations, "shagun.cities");
    expect(city.rls && city.forceRls).toBe(true);
    expect(city.acl).toContainEqual({ grantor: "postgres", grantee: "anon", privilege: "SELECT", grantable: false });
    expect(named(city.columns, "id")).toMatchObject({ type: "pg_catalog.uuid", notNull: true, collation: null });
    expect(named(city.columns, "id").default).toContain("gen_random_uuid()");
    expect(named(city.columns, "payload")).toMatchObject({ type: "pg_catalog.text", collation: "shagun.synthetic_binary", acl: [] });
    expect(named(city.columns, "quantity").formattedType).toBe("numeric(12,2)");
    expect(named(city.columns, "status").type).toBe("shagun.synthetic_status");
    expect(named(city.columns, "ordinal").identity).toBe("d");
    expect(named(city.columns, "search_document")).toMatchObject({ generated: "s", type: "pg_catalog.tsvector" });
    expect(named(city.columns, "search_document").default).toContain("to_tsvector");
    const research = named(metadata.relations, "shagun.venue_research");
    expect(named(research.columns, "payload").acl).toEqual([
      { grantor: "postgres", grantee: "authenticated", privilege: "SELECT", grantable: false },
      { grantor: "postgres", grantee: "authenticated", privilege: "UPDATE", grantable: true },
    ]);
  });

  it("retains definitions, deferral/validation, USER triggers and policy role names including PUBLIC", async () => {
    const metadata = (await snapshot()).value.metadata;
    const city = named(metadata.relations, "shagun.cities");
    expect(named(city.constraints, "cities_quantity_unvalidated").validated).toBe(false);
    const fk = named(named(metadata.relations, "shagun.venues").constraints, "venues_city_fkey");
    expect(fk).toMatchObject({ type: "f", deferrable: true, initiallyDeferred: true, validated: true });
    expect(fk.definition).toContain("REFERENCES shagun.cities(id)");
    expect(named(named(metadata.relations, "shagun.admin_users").constraints, "admin_users_id_fkey").definition)
      .toContain("REFERENCES auth.users(id)");
    expect(named(city.indexes, "synthetic_partial_idx").definition).toContain("WHERE");
    expect(city.triggers).toHaveLength(1);
    expect(city.triggers[0]).toMatchObject({ name: "synthetic_before", function: "shagun_private.synthetic_before()", enabled: "O" });
    expect(city.triggers[0].definition).toContain("BEFORE INSERT OR UPDATE");
    expect(named(city.policies, "z_public").roles).toEqual(["PUBLIC"]);
    expect(named(city.policies, "A_read").roles).toEqual(["anon", "authenticated", "service_role"]);
    expect(named(city.policies, "a_update")).toMatchObject({ permissive: false, command: "w", roles: ["authenticated"] });
    expect(named(city.policies, "a_update").using).toContain("quantity");
    expect(named(city.policies, "a_update").check).toContain("quantity");
  });

  it("retains full overloaded function bodies/signatures, enum order, domains, row/array types and scoped defaults", async () => {
    const metadata = (await snapshot()).value.metadata;
    const echoes = metadata.routines.filter((routine) => routine.name === "shagun.synthetic_echo");
    expect(echoes.map((routine) => routine.identityArguments)).toEqual(["p_value integer", "p_value text"]);
    expect(echoes[1]).toMatchObject({ owner: "postgres", language: "sql", kind: "f", strict: true, volatility: "i", parallel: "s", returnType: "pg_catalog.text" });
    expect(echoes[1].arguments).toContain("DEFAULT 'fallback'::text");
    expect(echoes[1].definition).toContain("CREATE OR REPLACE FUNCTION shagun.synthetic_echo");
    expect(echoes[1].definition).toContain("select p_value");
    expect(echoes[1].configuration.some((setting) => setting.startsWith("search_path="))).toBe(true);
    expect(named(metadata.routines, "shagun_private.synthetic_before").definer).toBe(true);
    expect(named(metadata.routines, "shagun.synthetic_document").identityArguments).toContain("shagun.cities");
    const status = named(metadata.types, "shagun.synthetic_status");
    expect(status.labels).toEqual([{ name: "A_active", position: 2 }, { name: "z_draft", position: 1 }]);
    expect(status.acl).toContainEqual({ grantor: "postgres", grantee: "PUBLIC", privilege: "USAGE", grantable: false });
    expect(status.arrayType).toBe("shagun._synthetic_status");
    expect(named(metadata.types, "shagun._synthetic_status").elementType).toBe("shagun.synthetic_status");
    expect(named(metadata.types, "shagun.cities").relation).toBe("shagun.cities");
    const domain = named(metadata.types, "shagun.synthetic_nonempty");
    expect(domain).toMatchObject({ kind: "d", baseType: "pg_catalog.text", notNull: true, collation: 'pg_catalog."C"' });
    expect(domain.default).toContain("fixture");
    expect(named(domain.constraints, "synthetic_nonempty_check").definition).toContain("VALUE");
    expect(metadata.defaultPrivileges).toEqual([
      { schema: "shagun", role: "postgres", type: "r", acl: [{ grantor: "postgres", grantee: "anon", privilege: "SELECT", grantable: false }] },
      { schema: "shagun_private", role: "postgres", type: "f", acl: [{ grantor: "postgres", grantee: "authenticated", privilege: "EXECUTE", grantable: false }] },
    ]);
  });

  it("sorts every metadata collection by names/signatures with C byte ordering, not allocation order", async () => {
    const metadata = (await snapshot()).value.metadata;
    const ordered = (values: readonly string[]) => {
      expect(values).toEqual([...values].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right))));
    };
    const aclOrder = (grants: readonly Grant[]) => ordered(grants.map((grant) =>
      [grant.grantor, grant.grantee, grant.privilege, grant.grantable ? "1" : "0"].join("\0")));
    ordered(metadata.schemas.map((schema) => schema.name));
    ordered(metadata.relations.map((relation) => relation.name));
    ordered(metadata.routines.map((routine) => `${routine.name}\0${routine.identityArguments}`));
    ordered(metadata.types.map((type) => type.name));
    ordered(metadata.defaultPrivileges.map((entry) => `${entry.schema}\0${entry.role}\0${entry.type}`));
    for (const entry of [...metadata.schemas, ...metadata.routines, ...metadata.types, ...metadata.defaultPrivileges]) aclOrder(entry.acl);
    for (const routine of metadata.routines) ordered(routine.configuration);
    for (const type of metadata.types) {
      ordered(type.labels.map((label) => label.name));
      ordered(type.constraints.map((constraint) => constraint.name));
    }
    for (const relation of metadata.relations) {
      aclOrder(relation.acl);
      ordered(relation.options);
      for (const collection of [relation.columns, relation.constraints, relation.indexes, relation.triggers, relation.policies]) ordered(collection.map((entry) => entry.name));
      for (const column of relation.columns) aclOrder(column.acl);
      for (const index of relation.indexes) ordered(index.options);
      for (const policy of relation.policies) ordered(policy.roles);
    }
  });

  it("ignores unrelated schemas, role memberships/settings and global defaults without claiming managed recovery", async () => {
    const before = await snapshot();
    await source.exec(`
      create schema storage;
      create table storage.objects (id text, payload text);
      insert into storage.objects values ('fixture', 'SYNTHETIC_STORAGE_NOT_IN_SNAPSHOT');
      create table public.cities (id text, payload text);
      insert into public.cities values ('fixture', 'SYNTHETIC_PUBLIC_NOT_IN_SNAPSHOT');
      create function auth.synthetic_outside() returns text language sql
        as $$ select 'SYNTHETIC_AUTH_NOT_IN_SNAPSHOT'::text $$;
      create role synthetic_group nologin;
      grant synthetic_group to anon;
      alter role anon bypassrls;
      alter role anon set synthetic.setting = 'SYNTHETIC_ROLE_NOT_IN_SNAPSHOT';
      alter default privileges for role postgres grant select on tables to authenticated;
    `);
    expect((await snapshot()).text === before.text).toBe(true);
  });
});

describe("metadata mutation detection", () => {
  it.each([
    ["schema privilege", "grant create on schema shagun to anon"],
    ["table privilege", "grant insert on shagun.cities to anon"],
    ["column privilege", "grant insert (payload) on shagun.venue_research to authenticated"],
    ["column grant option", "revoke grant option for update (payload) on shagun.venue_research from authenticated"],
    ["schema owner", "alter schema shagun owner to service_role"],
    ["table owner", "alter table shagun.facilities owner to service_role"],
    ["function privilege", "grant execute on function shagun.synthetic_echo(text) to anon"],
    ["type privilege", "grant usage on type shagun.synthetic_status to authenticated"],
    ["schema default privilege", "alter default privileges for role postgres in schema shagun grant insert on tables to anon"],
    ["RLS", "alter table shagun.cities disable row level security"],
    ["forced RLS", "alter table shagun.cities no force row level security"],
    ["policy predicate", 'alter policy "a_update" on shagun.cities with check (quantity > 2)'],
    ["policy roles", 'alter policy "A_read" on shagun.cities to authenticated'],
    ["function body", `create or replace function shagun.synthetic_echo(p_value text default 'fallback') returns text
      language sql immutable strict parallel safe set search_path = '' as $$ select p_value || 'SYNTHETIC_BODY_CHANGED' $$`],
    ["function configuration", "alter function shagun.synthetic_echo(text) set statement_timeout = '1s'"],
    ["function security mode", "alter function shagun.synthetic_echo(text) security definer"],
    ["index definition", "drop index shagun.synthetic_partial_idx; create index synthetic_partial_idx on shagun.cities (lower(payload)) where quantity > 2"],
    ["user trigger state", "alter table shagun.cities disable trigger synthetic_before"],
    ["constraint validation", "alter table shagun.cities validate constraint cities_quantity_unvalidated"],
    ["constraint deferral", "alter table shagun.venues alter constraint venues_city_fkey deferrable initially immediate"],
    ["column default", "alter table shagun.facilities alter column payload set default 'SYNTHETIC_DEFAULT_CHANGED'"],
    ["column nullability", "alter table shagun.facilities alter column payload drop not null"],
    ["column collation", 'alter table shagun.facilities alter column payload type text collate pg_catalog."C"'],
    ["domain constraint", "alter domain shagun.synthetic_nonempty add constraint synthetic_length_check check (length(value) < 500)"],
    ["enum ordering", "alter type shagun.synthetic_status add value 'middle' before 'A_active'"],
  ] as const)("detects changed %s metadata while row fingerprints stay unchanged", async (_name, ddl) => {
    const before = (await snapshot()).value;
    await source.exec(ddl);
    const after = (await snapshot()).value;
    expect(JSON.stringify(after.metadata) === JSON.stringify(before.metadata)).toBe(false);
    expect(after.data).toEqual(before.data);
  });
});

describe("empty ACL normalization before aclexplode", () => {
  const cases: readonly {
    name: string; ddl: string; probe: string; grants: (metadata: Snapshot["metadata"]) => Grant[];
  }[] = [
    {
      name: "schema",
      ddl: "revoke all on schema shagun_private from public, postgres, anon, authenticated, service_role",
      probe: "select cardinality(nspacl) = 0 as empty from pg_namespace where nspname = 'shagun_private'",
      grants: (metadata) => named(metadata.schemas, "shagun_private").acl,
    },
    {
      name: "relation",
      ddl: "revoke all on table shagun_private.schema_migrations from public, postgres, anon, authenticated, service_role",
      probe: "select cardinality(relacl) = 0 as empty from pg_class where oid = 'shagun_private.schema_migrations'::regclass",
      grants: (metadata) => named(metadata.relations, "shagun_private.schema_migrations").acl,
    },
    {
      name: "routine",
      ddl: "revoke all on function shagun_private.synthetic_before() from public, postgres, anon, authenticated, service_role",
      probe: "select cardinality(proacl) = 0 as empty from pg_proc where oid = 'shagun_private.synthetic_before()'::regprocedure",
      grants: (metadata) => named(metadata.routines, "shagun_private.synthetic_before").acl,
    },
    {
      name: "type",
      ddl: "revoke all on type shagun.synthetic_status from public, postgres, anon, authenticated, service_role",
      probe: "select cardinality(typacl) = 0 as empty from pg_type where oid = 'shagun.synthetic_status'::regtype",
      grants: (metadata) => named(metadata.types, "shagun.synthetic_status").acl,
    },
    {
      name: "schema default",
      // Per-schema GRANT/REVOKE normally removes an empty pg_default_acl row.
      // Explicit-empty storage is injected ONLY into this memory-only fixture.
      ddl: "update pg_catalog.pg_default_acl set defaclacl = '{}'::aclitem[] where defaclnamespace = 'shagun'::regnamespace and defaclobjtype = 'r'",
      probe: "select cardinality(defaclacl) = 0 as empty from pg_default_acl where defaclnamespace = 'shagun'::regnamespace and defaclobjtype = 'r'",
      grants: (metadata) => {
        const entry = metadata.defaultPrivileges.find((candidate) => candidate.schema === "shagun" && candidate.type === "r");
        if (!entry) throw new Error("Missing synthetic default ACL.");
        return entry.acl;
      },
    },
  ];

  it.each(cases)("does not invent implicit grants for an explicitly empty $name ACL or raise 22023", async ({ ddl, probe, grants }) => {
    const before = (await snapshot()).value;
    expect(grants(before.metadata).length).toBeGreaterThan(0);
    await source.exec(ddl);
    expect((await source.query<{ empty: boolean }>(probe)).rows[0].empty).toBe(true);
    const after = (await snapshot()).value;
    expect(grants(after.metadata)).toEqual([]);
    expect(JSON.stringify(after.metadata) === JSON.stringify(before.metadata)).toBe(false);
    expect(after.data).toEqual(before.data);
  });

  it("treats absent, revoked and explicitly empty column ACLs as the same lack of independent grants", async () => {
    const before = await snapshot();
    await source.exec(`grant select (payload) on shagun.facilities to anon;
      revoke select (payload) on shagun.facilities from anon`);
    expect((await snapshot()).text === before.text).toBe(true);
    // Normal GRANT/REVOKE canonicalizes to NULL. Exercise a stored '{}' directly
    // in the synthetic catalog without changing any real-service catalog.
    await source.exec(`update pg_catalog.pg_attribute set attacl = '{}'::aclitem[]
      where attrelid = 'shagun.facilities'::regclass and attname = 'payload'`);
    expect((await source.query<{ empty: boolean }>(`select attacl is not null and cardinality(attacl) = 0 as empty
      from pg_attribute where attrelid = 'shagun.facilities'::regclass and attname = 'payload'`)).rows[0].empty).toBe(true);
    expect((await snapshot()).text === before.text).toBe(true);
  });

  it("equates a NULL object ACL with its explicit built-in defaults, not with an empty ACL", async () => {
    const before = await snapshot();
    await source.exec(`update pg_catalog.pg_class set relacl = pg_catalog.acldefault('r', relowner)
      where oid = 'shagun_private.schema_migrations'::regclass`);
    expect((await snapshot()).text === before.text).toBe(true);
  });
});