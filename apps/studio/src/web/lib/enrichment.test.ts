import { describe, expect, it } from "vitest";
import type { TableDraft } from "@askdb/enrich";
import { enrichmentLevel } from "./enrichment";

// The Overview's counts, its pending list and the Tables list's filters all read this rule (#1054),
// so each edge case here is one place they used to disagree.
const draft = (fields: Partial<TableDraft>, columns: Record<string, string | undefined> = { a: undefined, b: undefined }): TableDraft => ({
  description: "",
  ...fields,
  columns: Object.fromEntries(Object.entries(columns).map(([id, description]) => [id, description === undefined ? {} : { description }])),
});

describe("enrichmentLevel", () => {
  it.each([
    ["nothing written", draft({}), "none"],
    ["a blank description", draft({ description: "   " }), "none"],
    ["the table described, columns not", draft({ description: "Orders." }), "partial"],
    ["aliases only", draft({ aliases: ["sales"] }), "partial"],
    ["aliases and every column, no table description", draft({ aliases: ["sales"] }, { a: "A.", b: "B." }), "partial"],
    ["one column described", draft({}, { a: "A.", b: undefined }), "partial"],
    ["the table and every column described", draft({ description: "Orders." }, { a: "A.", b: "B." }), "enriched"],
    ["a table with no columns, described", draft({ description: "Orders." }, {}), "enriched"],
  ] as const)("%s → %s", (_name, input, level) => {
    expect(enrichmentLevel(input)).toBe(level);
  });
});
