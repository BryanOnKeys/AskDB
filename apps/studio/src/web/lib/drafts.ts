import type { ColumnDraft, TableDraft } from "@askdb/enrich";

/** Whether `draft` differs from the saved draft it started from: Studio's one test for unsaved edits. */
export function isDraftEdited(draft: TableDraft | ColumnDraft | undefined, saved: TableDraft | ColumnDraft | undefined): boolean {
  return draft !== undefined && JSON.stringify(draft) !== JSON.stringify(saved);
}

/**
 * The drafts after the workspace is re-read (a resync, #1045). A table with unsaved edits keeps
 * them; every other table takes the server's draft, and tables that are gone drop out. An edited
 * table's columns follow the refreshed server draft too: a column keeps the user's edit only if
 * they changed it, so a column the server now describes isn't saved back blank, and a column the
 * database dropped goes away.
 */
export function refreshDrafts(
  drafts: Record<string, TableDraft>,
  previousSaved: Record<string, TableDraft>,
  nextSaved: Record<string, TableDraft>,
): Record<string, TableDraft> {
  return Object.fromEntries(Object.entries(nextSaved).map(([id, next]) => {
    const draft = drafts[id];
    const before = previousSaved[id];
    if (before === undefined || !isDraftEdited(draft, before)) return [id, structuredClone(next)];
    const columns = Object.fromEntries(Object.entries(next.columns).map(([columnId, nextColumn]) => {
      const edited = draft.columns[columnId];
      return [columnId, structuredClone(isDraftEdited(edited, before.columns[columnId]) ? edited : nextColumn)];
    }));
    return [id, { ...structuredClone(draft), columns }];
  }));
}
