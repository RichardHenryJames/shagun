import { readFile } from "node:fs/promises";
import {
  createSourceFile, isFunctionDeclaration, isNoSubstitutionTemplateLiteral,
  isTaggedTemplateExpression, ScriptTarget, type Node, type SourceFile,
} from "typescript";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { sanitizedFailure } from "../../scripts/db-migration-plan";

// Source-boundary contracts, NOT Supautils emulation or managed-service proof.
// Never import/run the CLI, read credentials, open a socket or execute SQL.
// PGlite cannot certify the provider's policy-management hook.
vi.mock("postgres", () => { throw new Error("Database clients are forbidden in access contract tests."); });
let runner: SourceFile;
beforeAll(async () => {
  const text = await readFile(new URL("../../scripts/db-migrate.ts", import.meta.url), "utf8");
  runner = createSourceFile("db-migrate.ts", text, ScriptTarget.Latest, true);
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

  it("sanitizes malformed-JSON SQLSTATE without inspecting raw settings or exception details", () => {
    const forbidden = vi.fn(() => { throw new Error("Raw provider error fields must not be inspected."); });
    const error = Object.defineProperties({ code: "22P02" }, Object.fromEntries(
      ["message", "detail", "hint", "query", "parameters", "stack", "cause"].map((field) => [field, { get: forbidden }]),
    ));
    expect(sanitizedFailure(error)).toEqual({
      code: "22P02",
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