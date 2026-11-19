import type { ColumnDraft, TableDraft } from "@askdb/enrich";

/** The enrichment levels, most complete first: the order the Tables list shows its filters in. */
export const ENRICHMENT_LEVELS = ["enriched", "partial", "none"] as const;
export type EnrichmentLevel = (typeof ENRICHMENT_LEVELS)[number];

/**
 * How far a table's enrichment has got: `enriched` once the table and every one of its columns
 * has a description, `partial` once anything is written (any describable field of the table or a
 * column), `none` before that. The Overview's counts, its pending list and the Tables list's
 * filters all read this one rule, so they can't disagree (#1054). Other fields don't make a table
 * `enriched`: only descriptions tell the model what a table and its columns hold.
 */
export function enrichmentLevel(draft: TableDraft): EnrichmentLevel {
  const columns = Object.values(draft.columns ?? {});
  const tableDescribed = hasText(draft.description);
  if (tableDescribed && columns.every((column) => hasText(column.description))) return "enriched";
  const started =
    tableDescribed ||
    hasText(draft.primaryEntity) ||
    hasText(draft.commonQueryLanguage) ||
    hasText(draft.exampleQuestions) ||
    hasItems(draft.aliases) ||
    hasItems(draft.tags) ||
    columns.some(columnStarted);
  return started ? "partial" : "none";
}

function columnStarted(column: ColumnDraft): boolean {
  return hasText(column.description) || hasItems(column.aliases) || hasItems(column.enum);
}

function hasText(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function hasItems(value: string[] | undefined): boolean {
  return (value?.length ?? 0) > 0;
}
