/**
 * Formal-style check (property-based, against a live SQLite engine): every executable form
 * `bindPreparedQuery()` returns puts every value in the slot of the placeholder it was bound to.
 *
 * Property: for any checked template over `orders` and any values and tenant scope, the
 * engine returns the same rows for `unboundSql` + `params`, for `sql` + `tenantParams`
 * (`tenantSqlMode: "sql-params"`) and for `sql` (`"sql-only"`), and those rows are the ones
 * the template means, computed here from the seeded rows without SQL.
 * Harm if broken: a tenant ID lands in a business slot, in another tenant root's slot, or a
 * business value in a tenant slot, or an inlined literal reads as another value, so the query
 * filters by the wrong tenant or the wrong value and returns rows the caller must not see.
 *
 * The template grammar mixes two tenant roots' placeholders with business placeholders in
 * shuffled order, repeats them, nests them under OR and in a subquery, uses list and scalar
 * slots, and adds a string literal that holds placeholder and marker text. Values include
 * quotes, `?`, `:name` text, backslashes and non-ASCII. That is the interleaving
 * `bindTenantIntoUnboundSql` does for `?` dialects (`packages/core/src/sql/checked-statement.ts`),
 * which example-based tests reach only for the orders someone wrote down.
 *
 * Scope, assumptions and how to run it: `.agents/skills/verify-bound-forms/SKILL.md`.
 * Needs no production seam: it calls only the public `bindPreparedQuery()` and `loadSchema()`.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import fc from "fast-check";
import { bindPreparedQuery, loadSchema, type PreparedQuery, type QueryParamSlot, type TenantScope } from "@askdb/core";
import { afterAll, describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const schema = loadSchema(join(here, "../../../../fixtures/schemas/agency-multi-tenant.schema"));
const AGENCIES = "table:public.agencies";
const CLIENTS = "table:public.clients";

// ---------------------------------------------------------------------------
// The model: rows, values, and what each WHERE conjunct means
// ---------------------------------------------------------------------------

type Row = { id: number; agency_id: string; client_id: string; status: string };
type Values = { s1: string; s2: string; l1: string[]; n1: number; b1: boolean };
type Scope = { agencyIds: string[]; clientIds: string[] };
type Spacing = { eq: string; open: string; close: string };
type Atom = { sql: (s: Spacing) => string; holds: (row: Row, values: Values, scope: Scope) => boolean };

/** A string literal in the template that holds placeholder and marker text; it must stay text. */
const DECOY = "x'?:s1 :tenant_agency_ids $1 @p1";
const DECOY_SQL = `'${DECOY.replace(/'/g, "''")}'`;

const ATOMS = {
  agencyIn: { sql: (s) => `agency_id IN${s.open}:tenant_agency_ids${s.close}`, holds: (r, _v, t) => t.agencyIds.includes(r.agency_id) },
  agencyEq: { sql: (s) => `agency_id${s.eq}:tenant_agency_ids`, holds: (r, _v, t) => t.agencyIds.includes(r.agency_id) },
  clientIn: {
    sql: (s) => `client_id IN (SELECT id FROM clients WHERE id IN${s.open}:tenant_client_ids${s.close})`,
    holds: (r, _v, t) => t.clientIds.includes(r.client_id),
  },
  clientEq: {
    sql: (s) => `client_id IN (SELECT id FROM clients WHERE id${s.eq}:tenant_client_ids)`,
    holds: (r, _v, t) => t.clientIds.includes(r.client_id),
  },
  statusEq: { sql: (s) => `status${s.eq}:s1`, holds: (r, v) => r.status === v.s1 },
  statusNe: { sql: () => `status <> :s2`, holds: (r, v) => r.status !== v.s2 },
  statusIn: { sql: (s) => `status IN${s.open}:l1${s.close}`, holds: (r, v) => v.l1.includes(r.status) },
  idAtLeast: { sql: () => `id >= :n1`, holds: (r, v) => r.id >= v.n1 },
  idFlag: { sql: (s) => `(id > 6)${s.eq}:b1`, holds: (r, v) => r.id > 6 === v.b1 },
  statusEither: { sql: (s) => `(status${s.eq}:s1 OR status IN${s.open}:l1${s.close})`, holds: (r, v) => r.status === v.s1 || v.l1.includes(r.status) },
  decoy: { sql: () => `status <> ${DECOY_SQL}`, holds: (r) => r.status !== DECOY },
} satisfies Record<string, Atom>;
type AtomName = keyof typeof ATOMS;

const DECLARATIONS: PreparedQuery["parameters"] = [
  { name: "s1", placeholder: ":s1", type: "string", cardinality: "one", source: "question" },
  { name: "s2", placeholder: ":s2", type: "string", cardinality: "one", source: "question" },
  { name: "l1", placeholder: ":l1", type: "string", cardinality: "many", source: "question" },
  { name: "n1", placeholder: ":n1", type: "number", cardinality: "one", source: "question" },
  { name: "b1", placeholder: ":b1", type: "boolean", cardinality: "one", source: "question" },
  { name: "tenant_agency_ids", placeholder: ":tenant_agency_ids", type: "string", cardinality: "many", source: "tenant" },
  { name: "tenant_client_ids", placeholder: ":tenant_client_ids", type: "string", cardinality: "many", source: "tenant" },
];

/** The template as a host stores it: the SQL and a declaration for each placeholder it uses. */
function preparedFor(namedSql: string): PreparedQuery {
  const code = namedSql.replaceAll(DECOY_SQL, "");
  const parameters = DECLARATIONS.filter((d) => new RegExp(`${d.placeholder}(?![A-Za-z0-9_])`).test(code));
  return { version: 1, dialect: "sqlite", dialectRules: "builtin", namedSql, parameters };
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Text that breaks SQL renderers: quotes, markers, placeholder text, comment openers, non-ASCII. */
const trickyPiece = fc.constantFrom("'", "''", '"', "?", "?1", ":", ":s1", ":tenant_agency_ids", "$1", "@p1", "\\", "\\'", "--", "/*", "*/", ";", " ", "a", "Z", "é", "ß", "😀", "¥", " ");
const trickyString = fc.oneof(
  { arbitrary: fc.array(trickyPiece, { maxLength: 6 }).map((parts) => parts.join("")), weight: 10 },
  { arbitrary: fc.string({ unit: "grapheme", maxLength: 8 }), weight: 10 },
  { arbitrary: fc.string({ maxLength: 8 }), weight: 10 },
  // A control character, which every form must refuse (INVALID_VALUE).
  { arbitrary: fc.constantFrom("a\tb", "\n", "x\u0000"), weight: 1 },
);
/** A tenant ID `sql-only` can inline: printable ASCII without a backslash, quotes included. */
const inlinableId = fc.string({ unit: fc.constantFrom(..." !\"#$%&'()*+,-./09:;<=>?@AZ[]^_`az{|}~"), minLength: 1, maxLength: 6 });
const tenantIds = fc.uniqueArray(fc.oneof(inlinableId, trickyString.filter((s) => s.length > 0)), { minLength: 1, maxLength: 3 });
const number = fc.oneof(
  { arbitrary: fc.integer({ min: -2, max: 14 }), weight: 6 },
  { arbitrary: fc.double({ noNaN: true, noDefaultInfinity: true }), weight: 2 },
  { arbitrary: fc.constantFrom(-0, 0.5, 6.5, 1e21, -1e-7, 2 ** 53 + 2), weight: 1 },
);

const caseArb = fc
  .record({
    agency: fc.array(fc.constantFrom<AtomName>("agencyIn", "agencyEq"), { minLength: 1, maxLength: 2 }),
    client: fc.array(fc.constantFrom<AtomName>("clientIn", "clientEq"), { maxLength: 2 }),
    business: fc.array(fc.constantFrom<AtomName>("statusEq", "statusNe", "statusIn", "idAtLeast", "idFlag", "statusEither", "decoy"), { maxLength: 5 }),
    order: fc.array(fc.nat(), { minLength: 9, maxLength: 9 }),
    spacing: fc.record({ eq: fc.constantFrom(" = ", "=", " =", "= "), open: fc.constantFrom(" (", "(", " ( "), close: fc.constantFrom(")", " )") }),
    values: fc.record({ s1: trickyString, s2: trickyString, l1: fc.array(trickyString, { minLength: 1, maxLength: 3 }), n1: number, b1: fc.boolean() }),
    agencyIds: tenantIds,
    clientIds: tenantIds,
    rowPicks: fc.array(fc.tuple(fc.nat(), fc.nat(), fc.nat()), { minLength: 1, maxLength: 12 }),
  })
  .map((c) => {
    const names = [...c.agency, ...c.client, ...c.business];
    // Shuffle by generated keys, so shrinking simplifies the order too.
    const atoms = names
      .map((name, i) => ({ name, key: c.order[i % c.order.length]! * 16 + i }))
      .sort((a, b) => a.key - b.key)
      .map((k) => k.name);
    const namedSql = `SELECT id FROM orders WHERE ${atoms.map((a) => ATOMS[a].sql(c.spacing)).join(" AND ")}`;
    const usesClients = c.client.length > 0;
    return { ...c, atoms, namedSql, scope: { agencyIds: c.agencyIds, clientIds: usesClients ? c.clientIds : [] } };
  });

/** Rows whose columns take the generated values and near misses, so every conjunct can both hold and fail. */
function seedRows(c: { values: Values; scope: Scope; rowPicks: Array<[number, number, number]> }): Row[] {
  const agencies = [...c.scope.agencyIds, "other-agency", `${c.scope.agencyIds[0]} `];
  const clients = [...c.scope.clientIds, ...c.scope.agencyIds, "other-client"];
  const statuses = [c.values.s1, c.values.s2, ...c.values.l1, DECOY, "zzz"];
  return c.rowPicks.map(([a, cl, s], i) => ({
    id: i + 1,
    agency_id: agencies[a % agencies.length]!,
    client_id: clients[cl % clients.length]!,
    status: statuses[s % statuses.length]!,
  }));
}

function tenantScope(scope: Scope): TenantScope {
  if (scope.clientIds.length === 0) return { access: { kind: "ids", tenantRoot: AGENCIES, ids: scope.agencyIds } };
  return {
    access: {
      kind: "multi_root",
      scopes: [
        { tenantRoot: AGENCIES, ids: scope.agencyIds },
        { tenantRoot: CLIENTS, ids: scope.clientIds },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

const db = new Database(":memory:");
db.exec(`
  CREATE TABLE orders (id INTEGER PRIMARY KEY, agency_id TEXT NOT NULL, client_id TEXT NOT NULL, status TEXT NOT NULL);
  CREATE TABLE clients (id TEXT PRIMARY KEY);
`);
const insertOrder = db.prepare("INSERT INTO orders (id, agency_id, client_id, status) VALUES (@id, @agency_id, @client_id, @status)");
const insertClient = db.prepare("INSERT OR IGNORE INTO clients (id) VALUES (?)");
afterAll(() => db.close());

function reseed(rows: Row[]): void {
  db.exec("DELETE FROM orders; DELETE FROM clients;");
  for (const row of rows) {
    insertOrder.run(row);
    insertClient.run(row.client_id);
  }
}

/** better-sqlite3 binds no booleans: a host passes SQLite's 1/0, which is what TRUE/FALSE are. */
function driverValue(v: unknown): unknown {
  if (typeof v === "boolean") return v ? 1 : 0;
  if (Array.isArray(v)) throw new Error("a `?` dialect never binds an array slot");
  return v;
}

function run(sql: string, params: readonly unknown[] = []): number[] {
  return (db.prepare(sql).all(...params.map(driverValue)) as Array<{ id: number }>).map((r) => r.id).sort((a, b) => a - b);
}

function describeError(error: unknown): string {
  const e = error as { name?: string; reason?: string; message?: string };
  return `${e.name ?? "Error"}${e.reason ? ` (${e.reason})` : ""}: ${e.message ?? String(error)}`;
}

const CONTROL_CHAR = /[\u0000-\u001f\u007f]/;
const INLINABLE = /^[\x20-\x5b\x5d-\x7e]*$/;
const RUNS = Number(process.env.ASKDB_VERIFY_RUNS ?? 300);
const SEED = process.env.ASKDB_VERIFY_SEED === undefined ? undefined : Number(process.env.ASKDB_VERIFY_SEED);

describe("bindPreparedQuery() forms agree on a live SQLite", () => {
  it("every form returns the rows the template means, with each value in its own slot", () => {
    fc.assert(
      fc.property(caseArb, (c) => {
        const prepared = preparedFor(c.namedSql);
        const used = new Set(prepared.parameters.map((p) => p.name));
        const values = Object.fromEntries(Object.entries(c.values).filter(([k]) => used.has(k)));
        const rows = seedRows(c);
        reseed(rows);
        const expected = rows.filter((r) => c.atoms.every((a) => ATOMS[a].holds(r, c.values, c.scope))).map((r) => r.id);
        const hasControlChar = Object.values(values).flat().some((v) => typeof v === "string" && CONTROL_CHAR.test(v));
        const allIds = [...c.scope.agencyIds, ...c.scope.clientIds];

        for (const mode of ["sql-params", "sql-only"] as const) {
          const unescapableId = mode === "sql-only" && allIds.some((id) => !INLINABLE.test(id));
          let bound;
          try {
            bound = bindPreparedQuery(prepared, values, { schema, tenantScope: tenantScope(c.scope), tenantSqlMode: mode });
          } catch (error) {
            // The two documented refusals. The grammar holds only templates that must bind, so any other is a failure.
            const reason = (error as { reason?: string }).reason;
            if (hasControlChar && reason === "INVALID_VALUE") continue;
            if (!hasControlChar && unescapableId && reason === "UNESCAPABLE_TENANT_ID") continue;
            throw new Error(`${mode} refused a template it must bind:\n  ${c.namedSql}\n  ${describeError(error)}`);
          }
          const at = `[${mode}] ${c.namedSql}`;
          expect(hasControlChar, `${at}: bound a control character`).toBe(false);
          expect(unescapableId, `${at}: inlined a tenant ID it can't inline safely`).toBe(false);
          expect(bound.verdict.outcome, `${at}: verdict`).toBe("allow");

          for (const b of bound.bindings) {
            const slots: QueryParamSlot[] = b.indices.map((i) => bound.params[i]!);
            const one = Array.isArray(b.value) ? b.value : [b.value];
            const occurrences = slots.length / one.length;
            expect(Number.isInteger(occurrences), `${at}: ${b.name}'s indices`).toBe(true);
            expect(slots, `${at}: ${b.name}'s indices point at its own values`).toEqual(Array.from({ length: occurrences }, () => one).flat());
          }

          expect(run(bound.unboundSql, bound.params), `${at}\n  unboundSql + params: ${bound.unboundSql}`).toEqual(expected);
          if (mode === "sql-params") {
            expect(run(bound.sql, bound.tenantParams ?? []), `${at}\n  sql + tenantParams: ${bound.sql}`).toEqual(expected);
          } else {
            expect(bound.tenantParams, `${at}: sql-only returns no tenantParams`).toBeUndefined();
            expect(run(bound.sql), `${at}\n  sql: ${bound.sql}`).toEqual(expected);
          }
        }
      }),
      { numRuns: RUNS, ...(SEED === undefined ? {} : { seed: SEED }) },
    );
  });
});
