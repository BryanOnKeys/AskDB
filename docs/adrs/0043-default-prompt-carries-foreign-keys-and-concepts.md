# ADR 0043: The default prompt carries foreign keys, concepts, business context and notes

**Status:** accepted · 2026-11-08

## Decision

A default `ask()` call, with no retriever, sends everything the schema artifact holds for the tracked tables. Each table lists its foreign keys, its business context and its column notes. The schema's concepts follow the tables.

The retrieval prompt uses the same renderer (`packages/core/src/schema/v2/format.ts`). It prints a foreign key only between two tables it shows, and only the concepts that retrieval picked (ADR 0042).

No option turns this content off, and no budget cuts the schema to fit. `loadSchema()` carries business context and notes as public fields: `NormalizedV2Table.businessContext` and `NormalizedV2Column.note`.

All of it follows the omission rules (ADR 0022).

## Why

- Without retrieval, the model guessed joins from column names. It never saw the vocabulary in `concepts.md` or in a table's business context.
- An option is easy to add later. An option is hard to remove after the 1.0 API freeze (ADR 0030).
- Cutting the schema drops grounding by table order, and a partial schema gives confidently wrong SQL. Retrieval is the answer for a big schema.

## Options

| | Option | Why it lost |
|---|---|---|
| A | Print all four in both prompts, behind the omission gate | **Chosen.** |
| B | Add them behind an option | An option removed after the API freeze is a breaking change. |
| C | Keep them retrieval-only | The model then needs RAG to learn how tables join, which most multi-table questions depend on. |
| D | A budget or truncation rule for the bigger prompt | A cut schema drops grounding by table order and gives confidently wrong SQL. |
| E | Business context and notes through a new `ask()` input or a hidden channel, with no new schema fields | A new input is public surface on every call site. A hidden channel is lost when a host copies, builds or bundles the schema. |

## Keep

| Rule | Checked by |
|---|---|
| A foreign key or a concept never names an untracked table, or a column that does not resolve. | `packages/core/src/schema/v2/format.test.ts` |
| With omission on, a foreign key with a sensitive column or table on either side is left out. A concept that names or links one is withheld. | `packages/core/src/schema/v2/format.test.ts` |
| A sensitive table's business context and a sensitive column's note never show. With omission on, a business context that names a sensitive column is withheld. | `packages/core/src/schema/v2/format.test.ts` |
| A column's note and its annotation are one gated unit: both are withheld when either names a sensitive column. | `packages/core/src/schema/v2/format.test.ts` |
| The retrieval prompt prints a foreign key only when it shows both tables, and once, from the schema. | `packages/core/src/retrieval/synthesize-ddl.test.ts` |
| The retrieval prompt lists only retrieved concepts, in the same shape as the default prompt. | `packages/core/src/retrieval/synthesize-ddl.test.ts` |
| The schema renders and chunks only pick: prompt text for a table comes from the loaded schema, for any schema a host passes. | review |
| The prompt never cuts the schema to fit a budget. No option turns foreign keys, concepts, business context or notes off. | review |
| The docs tell hosts that a default prompt sends this authored content to the language model provider. | review |
