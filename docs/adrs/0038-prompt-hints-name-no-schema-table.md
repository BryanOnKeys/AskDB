# ADR 0038: Prompt hints name no schema table

**Status:** accepted · 2026-11-06

## Decision

The NL→SQL prompt shows a table when the table is tracked and, under retrieval, when retrieval picked it. Text outside the DDL must not name a table that the prompt does not show.

The hints name no schema table at all. The note for an unknown name repeats only the word from the question. The note for a schema with one table does not name the table. Both notes count tracked tables only.

The tenant-policy block names only the tables the prompt shows. Two cases keep what the model needs to write a tenant predicate:

| Case | The block |
|---|---|
| A root whose table the prompt does not show | Keeps the root's label and placeholder. Leaves out the table id and the root's own columns. |
| A join path through an untracked table | Leaves the path out. With no path left, it tells the model not to read the scoped table. |
| A join path through a tracked table that retrieval left out | Keeps the path, with that table's name and columns. |

## Why

- The hint listed every table in the schema. The names of untracked tables, and of tables retrieval left out, reached the model provider.
- A list of only the shown tables must follow every later change to the DDL. Each new way to narrow the prompt is a new way to leak a name.
- The DDL already lists every table the model can use, so the hint loses nothing.
- Without a root's placeholder, or a path through a tracked table, the model cannot write the predicate, and the tenant check refuses the query.

## Options

| | Option | Why it lost |
|---|---|---|
| A | The hints name no schema table, and the tenant block names only the shown tables | **Chosen.** |
| B | The hints list only the tables the prompt shows | The list needs the retrieved table set on every call, and it only repeats the DDL above it. |
| C | The tenant block drops a root whose table is not shown | No tracked table scoped to that root can be filtered, so the tenant check refuses every query on them. |
| D | The tenant block drops every join path through a table that is not shown | It refuses queries on retrieved tables when no untracked table is involved. |

## Keep

| Rule | Checked by |
|---|---|
| A hint names no table from the schema, and counts tracked tables only. | `packages/core/src/sql/schema-question-precheck.test.ts` |
| The prompt names no untracked table, in a hint or in the tenant block. | `packages/core/src/ask.test.ts` |
| Under retrieval, the hints and the tenant block name no table that retrieval left out, except on a join path a shown table needs. | `packages/core/src/ask.test.ts`, `packages/core/src/sql/tenant-prompt.test.ts` |
| A root keeps its label and placeholder when its table is not shown. | `packages/core/src/sql/tenant-prompt.test.ts` |
| A column path or a polymorphic column on an untracked table is left out, as a join path is. | `packages/core/src/sql/tenant-prompt.test.ts` |
| The block finds a column's table in the schema, not by a split of the column id. | `packages/core/src/sql/tenant-prompt.test.ts` |
| A root that the policy names but does not declare is named only when the prompt shows its table. | `packages/core/src/sql/tenant-prompt.test.ts` |
| A caller that passes prebuilt DDL with a tenant policy must pass the ids of the shown tables, or the prompt builder throws. | `packages/core/src/sql/tenant-prompt.test.ts` |
| Under omission, the block still names the sensitive tenant columns of the tables it shows (ADR 0026). | review |

A root's label is text that the policy's author wrote for the prompt, so it reaches the model by design. A retrieved `tenant-policy` chunk also reaches the model as its author wrote it.
