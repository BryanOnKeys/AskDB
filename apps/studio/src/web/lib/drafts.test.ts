import { describe, expect, it } from "vitest";
import type { TableDraft } from "@askdb/enrich";
import { isDraftEdited, refreshDrafts } from "./drafts";

// What a resync (#1045) does to the drafts on screen: unsaved edits survive, everything else
// follows the re-read workspace.
const table = (description: string, columns: Record<string, string | undefined>): TableDraft => ({
  description,
  columns: Object.fromEntries(Object.entries(columns).map(([id, text]) => [id, text === undefined ? {} : { description: text }])),
});

describe("refreshDrafts", () => {
  it("gives an unedited table the server's new draft", () => {
    const before = { t: table("Old.", { a: undefined }) };
    const next = { t: table("New.", { a: "A." }) };
    expect(refreshDrafts(structuredClone(before), before, next)).toEqual(next);
  });

  it("keeps an edited table's edits, and drops a table that is gone", () => {
    const before = { t: table("", { a: undefined }), gone: table("", {}) };
    const drafts = { ...structuredClone(before), t: table("Typed, not saved.", { a: undefined }) };
    expect(refreshDrafts(drafts, before, { t: table("", { a: undefined }) })).toEqual({ t: table("Typed, not saved.", { a: undefined }) });
  });

  it("adds a new table with the server's draft", () => {
    const before = { t: table("", {}) };
    const next = { t: table("", {}), added: table("Added.", {}) };
    expect(refreshDrafts(structuredClone(before), before, next).added).toEqual(table("Added.", {}));
  });

  it("rebases an edited table's columns: edited ones stay, the rest follow the server, dropped ones go", () => {
    const before = { t: table("", { a: undefined, b: undefined, dropped: undefined }) };
    const drafts = { t: table("Typed.", { a: "My edit.", b: undefined, dropped: undefined }) };
    const next = { t: table("", { a: undefined, b: "Server now describes b.", added: undefined }) };
    expect(refreshDrafts(drafts, before, next)).toEqual({
      t: table("Typed.", { a: "My edit.", b: "Server now describes b.", added: undefined }),
    });
  });
});

describe("isDraftEdited", () => {
  it("compares by value, and treats a missing draft as unedited", () => {
    expect(isDraftEdited(table("x", {}), table("x", {}))).toBe(false);
    expect(isDraftEdited(table("y", {}), table("x", {}))).toBe(true);
    expect(isDraftEdited(undefined, table("x", {}))).toBe(false);
  });
});
