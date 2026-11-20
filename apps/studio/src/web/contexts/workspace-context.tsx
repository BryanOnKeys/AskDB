import { createContext, use, useCallback, useEffect, useEffectEvent, useMemo, useReducer } from "react";
import type { ReactNode } from "react";
import type { TenantPolicyFrontmatter, V2Concept } from "@askdb/core";
import type { ColumnDraft, SuggestSource, TableDraft } from "@askdb/enrich";
import type { SetupStatusDto, StudioTableDto, StudioWorkspaceDto, SuggestTenantPolicyResponse } from "@/shared/api";
import {
  getSetupStatus,
  getWorkspace,
  saveConcepts,
  saveTable,
  saveTenantPolicy,
  suggest,
  suggestTenantPolicy,
} from "../api";
import { isDraftEdited, refreshDrafts } from "../lib/drafts";
import { parseList } from "../lib/format";
import { suggestionKey } from "../lib/suggest-all";

async function handleSuggestTenantPolicy() {
  return suggestTenantPolicy();
}

type LoadState = { kind: "loading" | "ready" | "error" | "setup"; message?: string };
export type StatusMessage = { kind: "neutral" | "loading" | "success" | "error"; text: string };
/** How long a success or neutral status stays on screen before it clears itself. */
export const STATUS_CLEAR_MS = 4000;
/** Drafts the model returned for one field, shown inline under it until Use or Dismiss (#952). */
export type FieldSuggestion = { source: SuggestSource; candidates: Array<{ text: string }> };
export type SuggestAllProgress = { tableId: string; done: number; total: number };

interface WorkspaceContextValue {
  loadState: LoadState;
  setupStatus: SetupStatusDto | null;
  workspace: StudioWorkspaceDto | null;
  tables: StudioTableDto[];
  filteredTables: StudioTableDto[];
  selectedTable: StudioTableDto | null;
  selectedTableId: string | null;
  setSelectedTableId: (id: string | null) => void;
  drafts: Record<string, TableDraft>;
  selectedDraft: TableDraft | null;
  dirty: boolean;
  tableSearch: string;
  setTableSearch: (q: string) => void;
  saveStatus: StatusMessage | null;
  setSaveStatus: (s: StatusMessage | null) => void;
  busy: Set<string>;
  /** Keyed by `suggestionKey(source)`. */
  suggestions: Record<string, FieldSuggestion>;
  suggestingKeys: Set<string>;
  suggestAllProgress: SuggestAllProgress | null;

  load: () => Promise<void>;
  /**
   * Re-read the workspace without the loading screen, so the page on screen stays mounted (and
   * keeps its own state, such as a status message). Unsaved drafts survive. Throws on failure.
   */
  refresh: () => Promise<void>;
  saveSelectedTable: () => Promise<void>;
  resetSelectedDraft: () => void;
  updateTableDraft: (tableId: string, updater: (d: TableDraft) => TableDraft) => void;
  updateColumnDraft: (tableId: string, columnId: string, updater: (d: ColumnDraft) => ColumnDraft) => void;
  requestSuggestion: (source: SuggestSource) => Promise<void>;
  /** Drafts each field in turn, one model call each; nothing is written until Use and Save. */
  suggestAll: (tableId: string, sources: SuggestSource[]) => Promise<void>;
  applySuggestion: (source: SuggestSource, text: string) => void;
  dismissSuggestion: (source: SuggestSource) => void;
  handleSaveConcepts: (concepts: V2Concept[]) => Promise<void>;
  handleSaveTenantPolicy: (frontmatter: TenantPolicyFrontmatter, body?: string) => Promise<boolean>;
  handleSuggestTenantPolicy: () => Promise<SuggestTenantPolicyResponse>;
  withBusy: (key: string, task: () => Promise<void>) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const ctx = use(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}

type WorkspaceState = {
  loadState: LoadState;
  setupStatus: SetupStatusDto | null;
  workspace: StudioWorkspaceDto | null;
  selectedTableId: string | null;
  drafts: Record<string, TableDraft>;
  tableSearch: string;
  saveStatus: StatusMessage | null;
  suggestions: Record<string, FieldSuggestion>;
  suggestingKeys: Set<string>;
  suggestAllProgress: SuggestAllProgress | null;
  busy: Set<string>;
};

type WorkspaceAction =
  | { type: "set_loadState"; payload: LoadState }
  | { type: "setup_required"; status: SetupStatusDto }
  | { type: "load_complete"; workspace: StudioWorkspaceDto }
  | { type: "refresh_complete"; workspace: StudioWorkspaceDto }
  | { type: "set_workspace"; payload: StudioWorkspaceDto | null }
  | { type: "workspace_and_drafts"; workspace: StudioWorkspaceDto }
  | { type: "set_selectedTableId"; payload: string | null }
  | { type: "set_drafts"; payload: Record<string, TableDraft> }
  | { type: "set_tableSearch"; payload: string }
  | { type: "set_saveStatus"; payload: StatusMessage | null }
  | { type: "suggesting"; key: string; on: boolean }
  | { type: "suggestion_loaded"; key: string; suggestion: FieldSuggestion }
  | { type: "suggestion_dismissed"; key: string }
  | { type: "set_suggestAllProgress"; payload: SuggestAllProgress | null }
  | { type: "busy_add"; key: string }
  | { type: "busy_remove"; key: string }
  | { type: "reset_draft"; tableId: string; draft: TableDraft }
  | { type: "update_draft"; tableId: string; updater: (d: TableDraft) => TableDraft };

function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case "set_loadState": return { ...state, loadState: action.payload };
    case "setup_required": return { ...state, setupStatus: action.status, loadState: { kind: "setup" } };
    case "load_complete": {
      const draftMap = makeDraftMap(action.workspace);
      return {
        ...state,
        workspace: action.workspace,
        drafts: draftMap,
        selectedTableId: state.selectedTableId ?? action.workspace.tables[0]?.physical.id ?? null,
        loadState: { kind: "ready" },
      };
    }
    case "refresh_complete": return {
      ...state,
      workspace: action.workspace,
      drafts: refreshDrafts(state.drafts, savedDrafts(state.workspace), savedDrafts(action.workspace)),
    };
    case "set_workspace": return { ...state, workspace: action.payload };
    case "workspace_and_drafts": return {
      ...state,
      workspace: action.workspace,
      drafts: makeDraftMap(action.workspace),
    };
    case "set_selectedTableId": return { ...state, selectedTableId: action.payload };
    case "set_drafts": return { ...state, drafts: action.payload };
    case "set_tableSearch": return { ...state, tableSearch: action.payload };
    case "set_saveStatus": return { ...state, saveStatus: action.payload };
    case "suggesting": {
      const s = new Set(state.suggestingKeys);
      if (action.on) s.add(action.key);
      else s.delete(action.key);
      return { ...state, suggestingKeys: s };
    }
    case "suggestion_loaded": return { ...state, suggestions: { ...state.suggestions, [action.key]: action.suggestion } };
    case "suggestion_dismissed": {
      const suggestions = { ...state.suggestions };
      delete suggestions[action.key];
      return { ...state, suggestions };
    }
    case "set_suggestAllProgress": return { ...state, suggestAllProgress: action.payload };
    case "busy_add": { const s = new Set(state.busy); s.add(action.key); return { ...state, busy: s }; }
    case "busy_remove": { const s = new Set(state.busy); s.delete(action.key); return { ...state, busy: s }; }
    case "reset_draft": return {
      ...state,
      drafts: { ...state.drafts, [action.tableId]: action.draft },
      saveStatus: { kind: "neutral", text: `Reverted.` },
    };
    case "update_draft": {
      const current = clone(state.drafts[action.tableId] ?? {} as TableDraft);
      return {
        ...state,
        drafts: { ...state.drafts, [action.tableId]: action.updater(current) },
        saveStatus: { kind: "neutral", text: "Unsaved changes." },
      };
    }
  }
}

const initialWorkspaceState: WorkspaceState = {
  loadState: { kind: "loading" },
  setupStatus: null,
  workspace: null,
  selectedTableId: null,
  drafts: {},
  tableSearch: "",
  saveStatus: null,
  suggestions: {},
  suggestingKeys: new Set(),
  suggestAllProgress: null,
  busy: new Set(),
};

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(workspaceReducer, initialWorkspaceState);
  const {
    loadState, setupStatus, workspace, selectedTableId, drafts, tableSearch,
    saveStatus, suggestions, suggestingKeys, suggestAllProgress, busy,
  } = state;

  const setSelectedTableId = useCallback((v: string | null) => dispatch({ type: "set_selectedTableId", payload: v }), []);
  const setTableSearch = useCallback((v: string) => dispatch({ type: "set_tableSearch", payload: v }), []);
  const setSaveStatus = useCallback((v: StatusMessage | null) => dispatch({ type: "set_saveStatus", payload: v }), []);

  const tables = useMemo(() => workspace?.tables ?? [], [workspace]);
  const selectedTable = useMemo(
    () => tables.find((t) => t.physical.id === selectedTableId) ?? tables[0] ?? null,
    [tables, selectedTableId],
  );
  const selectedDraft = selectedTable ? drafts[selectedTable.physical.id] ?? selectedTable.draft : null;
  const dirty = Boolean(selectedTable) && isDraftEdited(selectedDraft ?? undefined, selectedTable?.draft);

  const filteredTables = useMemo(() => {
    const query = tableSearch.trim().toLowerCase();
    if (!query) return tables;
    return tables.filter((table) => {
      const draft = drafts[table.physical.id] ?? table.draft;
      return [table.physical.name, table.physical.schema, table.physical.id, ...(draft.aliases ?? []), ...(draft.tags ?? [])]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [drafts, tableSearch, tables]);

  const clearSaveStatus = useEffectEvent(() => setSaveStatus(null));

  useEffect(() => {
    if (saveStatus?.kind === "success" || saveStatus?.kind === "neutral") {
      const id = setTimeout(() => clearSaveStatus(), STATUS_CLEAR_MS);
      return () => clearTimeout(id);
    }
  }, [saveStatus]);

  const withBusy = useCallback(async (key: string, task: () => Promise<void>) => {
    dispatch({ type: "busy_add", key });
    try { await task(); } finally {
      dispatch({ type: "busy_remove", key });
    }
  }, []);

  const load = useCallback(async () => {
    dispatch({ type: "set_loadState", payload: { kind: "loading" } });
    try {
      const nextWorkspace = await getWorkspace();
      dispatch({ type: "load_complete", workspace: nextWorkspace });
    } catch (error) {
      // A 409 means the server is in setup mode — confirm and open the wizard.
      try {
        const status = await getSetupStatus();
        if (status.needed) {
          dispatch({ type: "setup_required", status });
          return;
        }
      } catch {
        // fall through to the original error
      }
      dispatch({ type: "set_loadState", payload: { kind: "error", message: getErrorMessage(error) } });
    }
  }, []);

  const refresh = useCallback(async () => {
    const nextWorkspace = await getWorkspace();
    dispatch({ type: "refresh_complete", workspace: nextWorkspace });
  }, []);

  const saveSelectedTable = useCallback(async () => {
    if (!selectedTable || !selectedDraft) return;
    setSaveStatus({ kind: "loading", text: "Saving changes..." });
    await withBusy("save", async () => {
      try {
        const nextWorkspace = await saveTable(selectedTable.physical.id, { draft: selectedDraft });
        dispatch({ type: "workspace_and_drafts", workspace: nextWorkspace });
        setSaveStatus({ kind: "success", text: `Saved ${selectedTable.physical.name}.` });
      } catch (error) {
        setSaveStatus({ kind: "error", text: getErrorMessage(error) });
      }
    });
  }, [selectedDraft, selectedTable, setSaveStatus, withBusy]);

  const resetSelectedDraft = useCallback(() => {
    if (!selectedTable) return;
    dispatch({ type: "reset_draft", tableId: selectedTable.physical.id, draft: clone(selectedTable.draft) });
    setSaveStatus({ kind: "neutral", text: `Reverted ${selectedTable.physical.name}.` });
  }, [selectedTable, setSaveStatus]);

  const updateTableDraft = useCallback((tableId: string, updater: (d: TableDraft) => TableDraft) => {
    dispatch({ type: "update_draft", tableId, updater });
  }, []);

  const updateColumnDraft = useCallback((tableId: string, columnId: string, updater: (d: ColumnDraft) => ColumnDraft) => {
    updateTableDraft(tableId, (draft) => {
      const columns = { ...draft.columns };
      columns[columnId] = updater({ ...columns[columnId] });
      return { ...draft, columns };
    });
  }, [updateTableDraft]);

  /** One model call for one field; returns the error message instead of throwing. */
  const fetchSuggestion = useCallback(async (source: SuggestSource): Promise<string | null> => {
    const key = suggestionKey(source);
    dispatch({ type: "suggesting", key, on: true });
    try {
      const result = await suggest({ source });
      dispatch({ type: "suggestion_loaded", key, suggestion: { source, candidates: result.candidates } });
      return null;
    } catch (error) {
      return getErrorMessage(error);
    } finally {
      dispatch({ type: "suggesting", key, on: false });
    }
  }, []);

  const requestSuggestion = useCallback(async (source: SuggestSource) => {
    const error = await fetchSuggestion(source);
    if (error) setSaveStatus({ kind: "error", text: error });
  }, [fetchSuggestion, setSaveStatus]);

  const suggestAll = useCallback(async (tableId: string, sources: SuggestSource[]) => {
    const errors: string[] = [];
    // One call at a time on purpose (ADR 0047): the progress count stays true and a wide table
    // doesn't fire every call at the provider at once.
    for (const [index, source] of sources.entries()) {
      dispatch({ type: "set_suggestAllProgress", payload: { tableId, done: index, total: sources.length } });
      const error = await fetchSuggestion(source);
      if (error) errors.push(error);
    }
    dispatch({ type: "set_suggestAllProgress", payload: null });
    const drafted = sources.length - errors.length;
    setSaveStatus(
      errors.length === 0
        ? { kind: "success", text: `Drafted ${drafted} field${drafted === 1 ? "" : "s"}. Review each draft, then Use or Dismiss it.` }
        : { kind: "error", text: `Drafted ${drafted} of ${sources.length} fields. ${errors.length} failed: ${errors[0]}` },
    );
  }, [fetchSuggestion, setSaveStatus]);

  const dismissSuggestion = useCallback((source: SuggestSource) => {
    dispatch({ type: "suggestion_dismissed", key: suggestionKey(source) });
  }, []);

  const applySuggestion = useCallback((source: SuggestSource, text: string) => {
    if (source.scope === "table") {
      updateTableDraft(source.tableId, (draft) => applyTableSuggestion(draft, source.field, text));
    } else {
      updateColumnDraft(source.tableId, source.columnId, (draft) => applyColumnSuggestion(draft, source.field, text));
    }
    dismissSuggestion(source);
  }, [dismissSuggestion, updateColumnDraft, updateTableDraft]);

  const handleSaveConcepts = useCallback(async (concepts: V2Concept[]) => {
    setSaveStatus({ kind: "loading", text: "Saving concepts..." });
    await withBusy("save-concepts", async () => {
      try {
        const nextWorkspace = await saveConcepts({ concepts });
        dispatch({ type: "set_workspace", payload: nextWorkspace });
        setSaveStatus({ kind: "success", text: "Concepts saved." });
      } catch (error) {
        setSaveStatus({ kind: "error", text: getErrorMessage(error) });
      }
    });
  }, [setSaveStatus, withBusy]);

  const handleSaveTenantPolicy = useCallback(async (frontmatter: TenantPolicyFrontmatter, body?: string) => {
    setSaveStatus({ kind: "loading", text: "Saving tenant policy..." });
    let saved = false;
    await withBusy("save-tenant-policy", async () => {
      try {
        const nextWorkspace = await saveTenantPolicy({ frontmatter, body });
        dispatch({ type: "set_workspace", payload: nextWorkspace });
        // The save swaps the form for the summary, so TenancyPage owns the success message (#1051).
        setSaveStatus(null);
        saved = true;
      } catch (error) {
        setSaveStatus({ kind: "error", text: getErrorMessage(error) });
      }
    });
    return saved;
  }, [setSaveStatus, withBusy]);

  const value = useMemo<WorkspaceContextValue>(() => ({
    loadState, setupStatus, workspace, tables, filteredTables, selectedTable, selectedTableId, setSelectedTableId,
    drafts, selectedDraft, dirty, tableSearch, setTableSearch, saveStatus, setSaveStatus, busy,
    suggestions, suggestingKeys, suggestAllProgress,
    load, refresh, saveSelectedTable, resetSelectedDraft, updateTableDraft, updateColumnDraft,
    requestSuggestion, suggestAll, applySuggestion, dismissSuggestion, handleSaveConcepts, handleSaveTenantPolicy, handleSuggestTenantPolicy,
    withBusy,
  }), [
    applySuggestion, busy, dirty, dismissSuggestion, drafts, filteredTables, handleSaveConcepts,
    handleSaveTenantPolicy, load, loadState, refresh, requestSuggestion, resetSelectedDraft,
    saveSelectedTable, saveStatus, selectedDraft, selectedTable, selectedTableId,
    setSaveStatus, setSelectedTableId, setTableSearch,
    setupStatus, suggestAll, suggestAllProgress, suggestingKeys, suggestions, tableSearch, tables, updateColumnDraft,
    updateTableDraft, withBusy, workspace,
  ]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

function makeDraftMap(workspace: StudioWorkspaceDto): Record<string, TableDraft> {
  return Object.fromEntries(workspace.tables.map((t) => [t.physical.id, clone(t.draft)]));
}

/** Each table's saved draft, by table id (empty before the first load). */
function savedDrafts(workspace: StudioWorkspaceDto | null): Record<string, TableDraft> {
  return Object.fromEntries(workspace?.tables.map((t) => [t.physical.id, t.draft]) ?? []);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function mergeList(existing: string[] | undefined, incoming: string[]): string[] {
  const base = existing ?? [];
  return [...base, ...incoming.filter((item) => !base.includes(item))];
}

function applyTableSuggestion(draft: TableDraft, field: string, text: string): TableDraft {
  if (field === "aliases" || field === "tags")
    return { ...draft, [field]: mergeList(draft[field], parseList(text)) };
  return { ...draft, [field]: text };
}

function applyColumnSuggestion(draft: ColumnDraft, field: string, text: string): ColumnDraft {
  if (field === "aliases" || field === "enum")
    return { ...draft, [field]: mergeList(draft[field], parseList(text)) };
  return { ...draft, [field]: text };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
