import { z } from "zod";

const TARGETS = [
  { relation: "shagun.cities", constraint: "cities_slug_check", prefix: "city" },
  { relation: "shagun.venues", constraint: "venues_slug_check", prefix: "venue" },
] as const;
const comparisonSchema = z.array(z.object({
  relation: z.string(), constraint: z.string(), source: z.string(), sourceAgain: z.string(),
  restored: z.string(), restoredAgain: z.string(),
}).strict()).length(2);
const constraintSchema = z.object({ name: z.string(), type: z.string(), definition: z.string() }).passthrough();
const relationSchema = z.object({ name: z.string(), columns: z.array(z.object({ name: z.string(), type: z.string(),
  notNull: z.boolean(), collation: z.string().nullable() }).passthrough()), constraints: z.array(constraintSchema) }).passthrough();

function targets(metadata: Record<string, unknown>) {
  const relations = z.array(relationSchema).parse(metadata.relations);
  return TARGETS.map((target) => {
    const matches = relations.filter((item) => item.name === target.relation);
    if (matches.length !== 1) throw new Error("Missing or duplicate normalization target.");
    const relation = matches[0];
    const slug = relation.columns.filter((column) => column.name === "slug");
    if (slug.length !== 1 || slug[0].type !== "pg_catalog.text" || !slug[0].notNull
        || !['pg_catalog."default"', "pg_catalog.default"].includes(slug[0].collation ?? "")) {
      throw new Error("Unexpected slug type or collation for normalization.");
    }
    const constraints = relation.constraints.filter((item) => item.name === target.constraint);
    if (constraints.length !== 1 || constraints[0].type !== "c" || !/^CHECK \(/.test(constraints[0].definition)
        || constraints[0].definition.length > 4000) throw new Error("Unexpected normalization constraint.");
    return { ...target, definition: constraints[0].definition };
  });
}

const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

/** Run only in the offline scratch restore container, never on the source.
 * PostgreSQL expands BETWEEN into a nested AND during parse transformation;
 * reparsing pg_dump's explicit comparisons flattens that AND. Canonicalize
 * both sides through independent empty tables and demonstrate a fixed point.
 * No application table/constraint is altered and no text regex rewrites SQL.
 */
export function slugConstraintNormalizationSql(metadata: Record<string, unknown>): string {
  const definitions = targets(metadata);
  const sql = ["create schema shagun_backup_compare;", `create table shagun_backup_compare.results (
    relation text, constraint_name text, source text, source_again text, restored text, restored_again text);`];
  for (const target of definitions) {
    for (const suffix of ["source", "source_again", "restored", "restored_again"]) {
      sql.push(`create table shagun_backup_compare.${target.prefix}_${suffix} (slug text not null);`);
    }
    sql.push(`do $shagun_compare$
      declare source_definition text := ${literal(target.definition)};
        restored_definition text; a text; b text; c text; d text;
      begin
        select pg_get_constraintdef(oid, false) into strict restored_definition from pg_constraint
          where conrelid = ${literal(target.relation)}::regclass and conname = ${literal(target.constraint)} and contype = 'c';
        execute 'alter table shagun_backup_compare.${target.prefix}_source add constraint normalized ' || source_definition;
        select pg_get_constraintdef(oid, false) into strict a from pg_constraint
          where conrelid='shagun_backup_compare.${target.prefix}_source'::regclass and conname='normalized';
        execute 'alter table shagun_backup_compare.${target.prefix}_source_again add constraint normalized ' || a;
        select pg_get_constraintdef(oid, false) into strict b from pg_constraint
          where conrelid='shagun_backup_compare.${target.prefix}_source_again'::regclass and conname='normalized';
        execute 'alter table shagun_backup_compare.${target.prefix}_restored add constraint normalized ' || restored_definition;
        select pg_get_constraintdef(oid, false) into strict c from pg_constraint
          where conrelid='shagun_backup_compare.${target.prefix}_restored'::regclass and conname='normalized';
        execute 'alter table shagun_backup_compare.${target.prefix}_restored_again add constraint normalized ' || c;
        select pg_get_constraintdef(oid, false) into strict d from pg_constraint
          where conrelid='shagun_backup_compare.${target.prefix}_restored_again'::regclass and conname='normalized';
        insert into shagun_backup_compare.results values (${literal(target.relation)}, ${literal(target.constraint)}, a,b,c,d);
      end;
    $shagun_compare$;`);
  }
  sql.push(`select jsonb_agg(jsonb_build_object('relation',relation,'constraint',constraint_name,
    'source',source,'sourceAgain',source_again,'restored',restored,'restoredAgain',restored_again)
    order by relation collate "C")::text from shagun_backup_compare.results;`);
  return sql.join("\n");
}

/** Preserve every comparison field except the two proven parse fixed points. */
export function normalizedConstraintMetadata(source: Record<string, unknown>, restored: Record<string, unknown>, evidence: unknown) {
  targets(source);
  targets(restored);
  const proof = comparisonSchema.parse(evidence);
  const left = structuredClone(source), right = structuredClone(restored);
  for (const target of TARGETS) {
    const matches = proof.filter((item) => item.relation === target.relation && item.constraint === target.constraint);
    if (matches.length !== 1) throw new Error("Normalization evidence target mismatch.");
    const item = matches[0];
    if (!item.source || item.source !== item.sourceAgain || item.restored !== item.restoredAgain || item.source !== item.restored) {
      throw new Error("Constraint parse fixed points differ.");
    }
    for (const metadata of [left, right]) {
      const relations = metadata.relations as Array<Record<string, unknown>>;
      const relation = relations.find((row) => row.name === target.relation)!;
      const constraints = relation.constraints as Array<Record<string, unknown>>;
      constraints.find((row) => row.name === target.constraint)!.definition = item.source;
    }
  }
  return { source: left, restored: right };
}