import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source safety checks only: never import an operator entry point or run Docker.
const source = readFileSync(new URL("../../scripts/integration.ts", import.meta.url), "utf8");
describe("isolated integration destructive-operation boundary", () => {
  it("checks all reset targets before recording first-use ownership", () => {
    const start = source.indexOf("if (!owners.length) {");
    const end = source.indexOf('// Clear only this suite', start);
    const guard = source.slice(start, end);
    for (const target of ["to_regnamespace('shagun')", "to_regnamespace('shagun_private')", "storage.buckets where id = 'shagun-media'", "STORAGE_POLICIES", "if (existing.exists) throw"]) expect(guard).toContain(target);
    expect(guard.indexOf("if (existing.exists) throw")).toBeLessThan(guard.indexOf("insert into shagun_test_control.owner"));
    expect(source.indexOf("verify-test-container")).toBeLessThan(start);
    expect(end).toBeLessThan(source.indexOf("drop schema if exists shagun cascade"));
  });
  it("pins local services and never creates test authentication bypasses", () => {
    expect(source).toContain('const API = "http://127.0.0.1:55321"');
    expect(source).toContain('const PROJECT = "shagun-integration"');
    expect(source).toContain('db.port !== "55322"');
    expect(source).toContain('SHAGUN_TEST_FIXTURES: "false"');
    expect(source).toContain('auth.admin.createUser({ email, password, email_confirm: true })');
    expect(source).toContain('if (!registration.error || registration.data.user) throw');
    expect(source).not.toContain('SHAGUN_TEST_FIXTURES: "true"');
  });
});