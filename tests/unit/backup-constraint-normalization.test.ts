import { isDeepStrictEqual } from "node:util";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { normalizedConstraintMetadata, slugConstraintNormalizationSql } from "../../scripts/backup-constraint-normalization";

const original = "CHECK ((((char_length(slug) >= 2) AND (char_length(slug) <= 90)) AND (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text)))";
const flat = "CHECK (((char_length(slug) >= 2) AND (char_length(slug) <= 90) AND (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text)))";
function metadata(definition: string) {
  return { relations: ["cities", "venues"].map((name) => ({ name: `shagun.${name}`, owner: "postgres", rls: true,
    columns: [{ name: "slug", type: "pg_catalog.text", notNull: true, collation: 'pg_catalog."default"' }],
    constraints: [{ name: `${name}_slug_check`, type: "c", definition, validated: true }],
  })) };
}
function proof(source = flat, restored = flat) {
  return ["cities", "venues"].map((name) => ({ relation: `shagun.${name}`, constraint: `${name}_slug_check`,
    source, sourceAgain: source, restored, restoredAgain: restored }));
}

describe("bounded PostgreSQL CHECK parse normalization", () => {
  it("uses independent empty scratch tables and verifies parse/deparse fixed points", async () => {
    const db = new PGlite();
    try {
      await db.exec(`create schema shagun; create table shagun.cities(slug text not null constraint cities_slug_check ${flat});
        create table shagun.venues(slug text not null constraint venues_slug_check ${flat}); set search_path=pg_catalog;`);
      const result = await db.exec(slugConstraintNormalizationSql(metadata(original)));
      const evidence = Object.values(result[result.length - 1].rows[0] as Record<string, unknown>)[0] as string;
      const normalized = normalizedConstraintMetadata(metadata(original), metadata(flat), JSON.parse(evidence));
      expect(isDeepStrictEqual(normalized.source, normalized.restored)).toBe(true);
      const checks = await db.query<{ definition: string }>(`select pg_get_constraintdef(oid,false) as definition
        from pg_constraint where conrelid='shagun.cities'::regclass and conname='cities_slug_check'`);
      expect(checks.rows[0].definition).toBe(flat);
    } finally { await db.close(); }
  });

  it("does not mutate original snapshots or erase unrelated constraint flags, ACLs or ownership", () => {
    const source = metadata(original), restored = metadata(flat);
    restored.relations[0].owner = "another_owner";
    restored.relations[1].constraints[0].validated = false;
    const normalized = normalizedConstraintMetadata(source, restored, proof());
    expect(isDeepStrictEqual(normalized.source, normalized.restored)).toBe(false);
    expect(source.relations[0].constraints[0].definition).toBe(original);
    expect(restored.relations[0].constraints[0].definition).toBe(flat);
  });

  it.each([flat.replace(">= 2", ">= 3"), flat.replace("<= 90", "< 90"), flat.replace(" AND ", " OR "),
    flat.replace("(-[a-z0-9]+)*", "(-[a-z0-9]+)+")])("rejects differing predicates %s", (changed) => {
    expect(() => normalizedConstraintMetadata(metadata(original), metadata(changed), proof(flat, changed))).toThrow();
  });

  it("rejects missing/duplicate targets, changed type/collation, and non-fixed-point evidence", () => {
    const duplicate = metadata(original); duplicate.relations.push(duplicate.relations[0]);
    expect(() => slugConstraintNormalizationSql(duplicate)).toThrow();
    const changed = metadata(original); changed.relations[0].columns[0].type = "pg_catalog.varchar";
    expect(() => slugConstraintNormalizationSql(changed)).toThrow();
    changed.relations[0].columns[0].type = "pg_catalog.text"; changed.relations[0].columns[0].collation = "pg_catalog.C";
    expect(() => slugConstraintNormalizationSql(changed)).toThrow();
    const nonfixed = proof(); nonfixed[0].sourceAgain = original;
    expect(() => normalizedConstraintMetadata(metadata(original), metadata(flat), nonfixed)).toThrow();
    expect(() => normalizedConstraintMetadata(metadata(original), metadata(flat), [proof()[0], proof()[0]])).toThrow();
  });
});