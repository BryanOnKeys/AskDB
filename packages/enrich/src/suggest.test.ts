import { describe, expect, it } from "vitest";
import type { NormalizedSchemaV2, NormalizedV2Column } from "@askdb/core";
import { buildSuggestionTarget, SuggestSourceNotFoundError } from "./suggest.js";

function column(table: string, name: string): NormalizedV2Column {
  return {
    id: `table:public.${table}#${name}`,
    name,
    type: "text",
    nullable: false,
    primaryKey: name === "id",
    sensitive: false,
  };
}

const schema: NormalizedSchemaV2 = {
  schemaId: "clinic",
  warnings: [],
  tables: [
    {
      id: "table:public.patients",
      name: "patients",
      schema: "public",
      sensitive: false,
      columns: [column("patients", "id"), column("patients", "diagnosis_code")],
    },
    {
      id: "table:public.visits",
      name: "visits",
      schema: "public",
      sensitive: false,
      columns: [column("visits", "id"), column("visits", "patient_id")],
    },
  ],
};

describe("buildSuggestionTarget", () => {
  it("throws SuggestSourceNotFoundError for an unknown table", () => {
    expect(() =>
      buildSuggestionTarget(schema, { scope: "table", tableId: "table:public.nonexistent", field: "description" }),
    ).toThrow(
      expect.objectContaining({
        name: "SuggestSourceNotFoundError",
        message: "No such table: table:public.nonexistent",
        tableId: "table:public.nonexistent",
        columnId: undefined,
      }),
    );
  });

  it("throws SuggestSourceNotFoundError for an unknown column in the requested table", () => {
    expect(() =>
      buildSuggestionTarget(schema, {
        scope: "column",
        tableId: "table:public.patients",
        columnId: "table:public.patients#nonexistent",
        field: "description",
      }),
    ).toThrow(
      expect.objectContaining({
        name: "SuggestSourceNotFoundError",
        message: "Column not found: table:public.patients#nonexistent in public.patients",
        tableId: "table:public.patients",
        columnId: "table:public.patients#nonexistent",
      }),
    );
  });

  it("throws SuggestSourceNotFoundError for a column of another table", () => {
    expect(() =>
      buildSuggestionTarget(schema, {
        scope: "column",
        tableId: "table:public.patients",
        columnId: "table:public.visits#id",
        field: "aliases",
      }),
    ).toThrow(SuggestSourceNotFoundError);
    expect(() =>
      buildSuggestionTarget(schema, {
        scope: "column",
        tableId: "table:public.patients",
        columnId: "table:public.visits#id",
        field: "aliases",
      }),
    ).toThrow("Column not found: table:public.visits#id in public.patients");
  });

  it("returns a column target for a column of the requested table", () => {
    const target = buildSuggestionTarget(schema, {
      scope: "column",
      tableId: "table:public.patients",
      columnId: "table:public.patients#diagnosis_code",
      field: "description",
    });

    expect(target).toMatchObject({
      kind: "column-description",
      table: { id: "table:public.patients" },
      columnId: "table:public.patients#diagnosis_code",
    });
  });
});
