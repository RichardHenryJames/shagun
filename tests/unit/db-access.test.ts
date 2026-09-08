import { readFile } from "node:fs/promises";
import {
  createSourceFile, isFunctionDeclaration, isNoSubstitutionTemplateLiteral,
  isTaggedTemplateExpression, ScriptTarget, type Node, type SourceFile,
} from "typescript";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { metadataSnapshotQuery, type ManagedSchema } from "../../scripts/db-catalog-snapshot";
import { STORAGE_POLICIES, sanitizedFailure } from "../../scripts/db-migration-plan";

// Source-boundary contracts, NOT Supautils emulation or managed-service proof.
// Never import/run the CLI, read credentials, open a socket or execute SQL.
// PGlite cannot certify the provider's policy-management hook.
vi.mock("postgres", () => { throw new Error("Database clients are forbidden in access contract tests."); });
let runner: SourceFile;
let catalogSource: SourceFile;
beforeAll(async () => {
  const text = await readFile(new URL("../../scripts/db-migrate.ts", import.meta.url), "utf8");
  runner = createSourceFile("db-migrate.ts", text, ScriptTarget.Latest, true);
  const catalogText = await readFile(new URL("../../scripts/db-catalog-snapshot.ts", import.meta.url), "utf8");
  catalogSource = createSourceFile("db-catalog-snapshot.ts", catalogText, ScriptTarget.Latest, true);
});

function compact(text: string) { return text.replace(/\s+/g, " ").trim(); }

function runnerFunction(name: string) {
  const declaration = runner.statements.filter(isFunctionDeclaration).find((node) => node.name?.text === name);
  if (!declaration) throw new Error("Missing runner function for source contract.");
  return declaration;
}

function capabilitySql() {
  const queries: string[] = [];
  function visit(node: Node): void {
    if (isTaggedTemplateExpression(node) && node.tag.getText(runner) === "tx"
      && isNoSubstitutionTemplateLiteral(node.template) && node.template.text.includes("as owner_ready")) {
      queries.push(node.template.text);
    }
    node.forEachChild(visit);
  }
  visit(runnerFunction("preflight"));
  expect(queries).toHaveLength(1);
  return compact(queries[0]);
}

describe("managed Storage authority source contract (no database execution)", () => {
  it("pins owner USAGE or exact current-role delegation from a protected registered GUC", () => {
    const sql = capabilitySql();
    const projection = sql.indexOf(" select (select relrowsecurity");
    expect(projection).toBeGreaterThan(0);
    expect(sql.slice(0, projection)).toBe(compact(`
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
    `));
    // CASE excludes user/internal contexts before parsing. COALESCE fails closed
    // for an absent/empty/null setting or missing role; wrong JSON shapes fail the
    // type checks. The literal ? operand cannot expand wildcards or other tables.
    // The native JSON cast errors on malformed input; this is a source contract,
    // not an executed PostgreSQL/Supautils behavior test.
  });

  it("returns only booleans and confines the OR to policy authority, retaining every other privilege", () => {
    const sql = capabilitySql();
    const projection = sql.indexOf(" select (select relrowsecurity");
    expect(projection).toBeGreaterThan(0);
    expect(sql.slice(projection).trim()).toBe(compact(`
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
    `));
  });

  it("retains the managed, RLS, authenticated-permission and owner-readiness rejection gates", () => {
    const preflight = compact(runnerFunction("preflight").getText(runner));
    for (const gate of [
      'if (!managed?.valid) throw new SafeError("MANAGED_DEPENDENCIES");',
      'if (!capabilities?.storage_rls) throw new SafeError("STORAGE_RLS");',
      `if (!capabilities.authenticated_usage || !capabilities.authenticated_select
        || !capabilities.authenticated_insert || !capabilities.authenticated_delete) throw new SafeError("STORAGE_PERMISSIONS");`,
      'if (!capabilities.owner_ready) throw new SafeError("MIGRATION_PRIVILEGES");',
      "managedPrerequisites: capabilities",
    ]) expect(preflight).toContain(compact(gate));
    expect(preflight).not.toMatch(/\b(?:set_config|unsafe|console|stdout|stderr)\b|JSON\.parse/);
    expect(capabilitySql()).not.toContain("current_setting");
  });

  it.each(["22P02", "22023"])("sanitizes SQLSTATE %s without inspecting raw settings or exception details", (code) => {
    const forbidden = vi.fn(() => { throw new Error("Raw provider error fields must not be inspected."); });
    const error = Object.defineProperties({ code }, Object.fromEntries(
      ["message", "detail", "hint", "query", "parameters", "stack", "cause"].map((field) => [field, { get: forbidden }]),
    ));
    expect(sanitizedFailure(error)).toEqual({
      code,
      message: "The operation failed. Database, filesystem and network details are redacted. No automatic retry is performed.",
    });
    expect(forbidden).not.toHaveBeenCalled();
    const catcher = runner.text.slice(runner.text.lastIndexOf("void main().catch("));
    expect(catcher).toContain('status: "failed", stage: inspectionStage, position, ...sanitizedFailure(error)');
    expect(catcher).toContain('/^\\d+$/.test(String(error.position)) ? Number(error.position) : undefined');
    expect(catcher).not.toMatch(/error\.(?:message|detail|hint|query|parameters|stack|cause)\b/);
  });

  it("keeps native migration execution and preflight inside the explicit all-or-nothing transaction", () => {
    const main = compact(runnerFunction("main").getText(runner));
    expect(main).toContain('report = await sql.begin(options.apply ? "isolation level repeatable read read write" : "isolation level repeatable read read only", async (tx) => {');
    expect(main).toContain("const prerequisites = await preflight(tx, options.sourceEnv !== undefined);");
    expect(main).toContain('if (!options.apply) return { status: "inspection-passed", mode: "read-only", ...common, own: existingOwn, preservationComparisonPerformed: false };');
    expect(main).toContain("for (const migration of plan.pending) await executeMigration(tx, migration, plan.firstInstall);");
    expect(main).toContain("const preservation = assertPreserved(before, after);");
    expect(compact(runnerFunction("executeMigration").getText(runner))).toContain(
      "for (const statement of migration.statements) await tx.unsafe(statement.text, [], { prepare: false }).simple();",
    );
  });
});

describe("catalog snapshot source contract (SQL behavior is covered in isolated PGlite)", () => {
  it("executes the shared query unchanged, preserves the stage and fails closed on a missing schema", () => {
    expect(compact(runnerFunction("metadataSnapshot").getText(runner))).toBe(compact(`
      async function metadataSnapshot(tx: Tx, schema: ManagedSchema, newStorage: boolean, newInventory: boolean): Promise<string> {
        inspectionStage = \`metadata-\${schema}\`;
        const query = metadataSnapshotQuery(schema, newStorage, newInventory);
        const [row] = await tx.unsafe<{ snapshot: string }[]>(query.text, query.parameters);
        if (!row) throw new SafeError("MANAGED_DEPENDENCIES");
        return row.snapshot;
      }
    `));
    const snapshot = compact(runnerFunction("snapshot").getText(runner));
    for (const schema of ["public", "auth", "storage"]) {
      expect(snapshot).toContain(`${schema}: await metadataSnapshot(tx, "${schema}", newStorage, newInventory)`);
    }
  });

  it("binds schema, both flags and every exact reserved policy without interpolating input into SQL", () => {
    const original = metadataSnapshotQuery("public", false, false);
    expect(original.parameters).toEqual(["public", false, false, ...STORAGE_POLICIES]);
    const other = metadataSnapshotQuery("storage", true, true);
    expect(other.text).toBe(original.text);
    expect(other.parameters).toEqual(["storage", true, true, ...STORAGE_POLICIES]);
    // Deliberately bypass the TS union to prove that even invalid input remains
    // a bound value. The runner only calls the three literal ManagedSchemas.
    const invalid = "public'; select 1; --" as ManagedSchema;
    const hostile = metadataSnapshotQuery(invalid, false, true);
    expect(hostile.text).toBe(original.text);
    expect(hostile.text).not.toContain(invalid);
    expect(hostile.parameters).toEqual([invalid, false, true, ...STORAGE_POLICIES]);
    expect(original.text).toContain("n.nspname = $1::text");
    expect(original.text).toContain("$2::boolean and n.nspname = 'storage' and c.relname = 'objects'");
    expect(original.text).toContain("$3::boolean and n.nspname = 'auth' and c.relname = 'users' and t.tgisinternal");
    for (let index = 0; index < STORAGE_POLICIES.length; index++) {
      expect(original.text).toContain(`$${index + 4}::text`);
      expect(original.text).not.toContain(`'${STORAGE_POLICIES[index]}'`);
    }
  });

  it("restricts ACL expressions to checked-in keys and normalizes all six ACL surfaces without dropping grants", () => {
    const acl = catalogSource.statements.filter(isFunctionDeclaration).find((node) => node.name?.text === "acl");
    expect(acl).toBeDefined();
    expect(compact(acl!.getText(catalogSource))).toContain("function acl(kind: keyof typeof ACL_EXPRESSIONS): string");
    const sql = metadataSnapshotQuery("public", false, false).text;
    expect(sql.match(/pg_catalog\.aclexplode\(nullif\(/g)).toHaveLength(6);
    expect(sql).toContain("pg_catalog.aclexplode(nullif(a.attacl, '{}'::pg_catalog.aclitem[]))");
    expect(sql).not.toContain("coalesce(a.attacl");
    expect(sql).toContain("pg_catalog.aclexplode(nullif(coalesce(t.typacl, pg_catalog.acldefault('T', t.typowner))");
    expect(sql).not.toContain("acldefault('t'");
    expect(sql).toContain("'grantor', g.grantor::text, 'grantee', g.grantee::text");
    expect(sql).toContain("'privilege', g.privilege_type, 'grantable', g.is_grantable");
    expect(sql).toContain("order by g.grantor, g.grantee, g.privilege_type, g.is_grantable");
  });

  it("keeps the builder import-safe and excludes bodies, passwords, private records and config blobs", () => {
    const source = catalogSource.getText();
    expect(source).not.toMatch(/\b(?:process|console|stdout|stderr|require|set_config)\s*[.(]|from\s+["'](?:postgres|node:|dotenv)/);
    const sql = metadataSnapshotQuery("public", false, false).text;
    expect(sql).not.toMatch(/\b(?:pg_get_functiondef|prosrc|probin|proconfig|rolpassword|rolconfig|setconfig|pg_authid|pg_settings)\b/i);
    expect(sql).not.toMatch(/\bfrom\s+(?:auth\.users|storage\.objects|storage\.buckets)\b/i);
    expect(sql).toContain("pg_get_function_identity_arguments(p.oid)");
    expect(sql).toContain("pg_get_function_result(p.oid)");
    expect(sql).toContain("from pg_auth_members m");
    expect(sql).toContain("'id', r.oid::text, 'superuser', r.rolsuper, 'inherit', r.rolinherit, 'bypassRls', r.rolbypassrls");
  });

  it("reports only digests for the three logical metadata snapshots", () => {
    const summary = compact(runnerFunction("snapshotSummary").getText(runner));
    expect(summary).toContain("metadataDigests: { public: sha256(value.metadata.public), auth: sha256(value.metadata.auth), storage: sha256(value.metadata.storage) }");
    expect(summary).not.toMatch(/\b(?:console|stdout|stderr)\b/);
    expect(compact(runnerFunction("main").getText(runner))).toContain("const preservation = assertPreserved(before, after);");
  });
});