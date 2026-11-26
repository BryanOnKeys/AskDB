import { describe, expect, it } from "vitest";
import type { TableDraft } from "@askdb/enrich";
import { enrichmentLevel } from "./enrichment";

// The Overview's counts, its pending list and the Tables list's filters all read this rule (#1054),
// so each edge case here is one place they used to disagree.
const draft = (fields: Partial<TableDraft>, columns: Record<string, string | undefined> = { a: undefined, b: undefined }): TableDraft => ({
  description: "",
  columns: Object.fromEntries(Object.entries(columns).map(([id, description]) => [id, description === undefined ? {} : { description }])),
  ...fields,
});

describe("enrichmentLevel", () => {
  it.each([
    ["nothing written", draft({}), "none"],
    ["a blank description", draft({ description: "   " }), "none"],
    ["the table described, columns not", draft({ description: "Orders." }), "partial"],
    ["aliases only", draft({ aliases: ["sales"] }), "partial"],
    ["aliases and every column, no table description", draft({ aliases: ["sales"] }, { a: "A.", b: "B." }), "partial"],
    ["one column described", draft({}, { a: "A.", b: undefined }), "partial"],
    ["only tags", draft({ tags: ["crm"] }), "partial"],
    ["only a primary entity", draft({ primaryEntity: "Customer" }), "partial"],
    ["only business vocabulary", draft({ commonQueryLanguage: "Buyers are customers." }), "partial"],
    ["only example questions", draft({ exampleQuestions: "Who bought most?" }), "partial"],
    ["only a column alias", draft({ columns: { a: { aliases: ["x"] } } }), "partial"],
    ["only a column's enum notes", draft({ columns: { a: { enum: ["open"] } } }), "partial"],
    ["a blank primary entity and empty lists", draft({ primaryEntity: "  ", tags: [], aliases: [] }), "none"],
    ["the table and every column described", draft({ description: "Orders." }, { a: "A.", b: "B." }), "enriched"],
    ["a table with no columns, described", draft({ description: "Orders." }, {}), "enriched"],
  ] as const)("%s → %s", (_name, input, level) => {
    expect(enrichmentLevel(input)).toBe(level);
  });
});
