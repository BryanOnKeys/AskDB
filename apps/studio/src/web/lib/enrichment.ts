import type { TableDraft } from "@askdb/enrich";

export type EnrichmentLevel = "enriched" | "partial" | "none";

/**
 * How far a table's enrichment has got: `enriched` once the table and every one of its columns
 * has a description, `partial` once anything is written (a description, an alias, a column's
 * description), `none` before that. The Overview's counts, its pending list and the Tables
 * list's filters all read this one rule, so they can't disagree (#1054). Aliases alone don't
 * make a table `enriched`: they don't tell the model what the table holds.
 */
export function enrichmentLevel(draft: TableDraft): EnrichmentLevel {
  const columns = Object.values(draft.columns ?? {});
  const tableDescribed = hasText(draft.description);
  if (tableDescribed && columns.every((column) => hasText(column.description))) return "enriched";
  const started =
    tableDescribed || (draft.aliases?.length ?? 0) > 0 || columns.some((column) => hasText(column.description));
  return started ? "partial" : "none";
}

function hasText(value: string | undefined): boolean {
  return Boolean(value?.trim());
}
