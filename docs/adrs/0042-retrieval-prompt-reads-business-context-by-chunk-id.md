# ADR 0042: The retrieval prompt reads business context from the chunks

**Status:** accepted · 2026-11-07

## Decision

Under retrieval, a table's business context reaches the model from the retrieved chunks. `@askdb/core` reads a `table` chunk as business context when its id is `<table ref>#biz`. A long body is split into parts with ids `<table ref>#biz#bc:<n>`. The retrieval prompt lists the text under its table, after the table's common query language.

Business context passes the same gates as common query language. It never shows for a sensitive table. With omission on, it is withheld when it names a sensitive column or its chunk is flagged `sensitive` (ADR 0022).

A column's note does not come from a chunk. The retrieval prompt reads it from the loaded schema, as the default prompt does (ADR 0043). A column chunk only picks its table.

## Why

- The schema v2 contract promises that business context reaches the model through retrieval. The chunk's text was dropped, because a `table` chunk only picked its table.
- Reading the id changes no exported type, and indexes built before the change work as they are.

## Options

| | Option | Why it lost |
|---|---|---|
| A | Core reads business context from a `table` chunk by its `#biz` id | **Chosen.** |
| B | A new `"business-context"` chunk type | It breaks hosts with an exhaustive switch on the chunk type. Stored chunks keep `type: "table"` until a forced reindex, so core needs the id check anyway. |
| C | Change the contract: the section only steers retrieval | It drops the promise that business terms reach the model. |
| D | Render the loaded schema's business context for every picked table | It added public fields to a 1.0 package for no gain here. ADR 0043 later added them for the default prompt, and retrieval still shows only what it retrieved. |

## Keep

| Rule | Checked by |
|---|---|
| The chunker's `#biz` and `#biz#bc:<n>` ids are a contract between `@askdb/rag` and `@askdb/core`. A change to the ids changes the synthesis in the same PR. | `packages/rag/src/retrieval-prompt.test.ts` |
| The retrieval prompt lists a retrieved business context under its table, with a split body's parts in body order. | `packages/core/src/retrieval/synthesize-ddl.test.ts` |
| Business context never shows for a sensitive table. With omission on, it is withheld when it names a sensitive column or its chunk is flagged. | `packages/core/src/retrieval/synthesize-ddl.test.ts`, `packages/rag/src/retrieval-prompt.test.ts` |
| A `table` chunk with any other id only picks its table, so a custom retriever is unaffected. | `packages/core/src/retrieval/synthesize-ddl.test.ts` |
| A column's note comes from the schema, not from a column chunk. It joins the column's annotation as one gated unit. | `packages/core/src/retrieval/synthesize-ddl.test.ts` |
| A retrieved concept keeps its label, and a retrieved tenant-policy section keeps its heading. | `packages/rag/src/retrieval-prompt.test.ts` |
| The docs tell hosts that a retriever sends authored text to the language model provider, not only to the embedding provider. | review |

`docs/contracts/schema-v2.md` (chunking rules) holds the chunk ids.
