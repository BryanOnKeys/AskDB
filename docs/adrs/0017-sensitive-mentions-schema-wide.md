# ADR 0017: Sensitive mentions are checked against one schema-wide list

**Status:** accepted · 2026-10-04

## Decision

`@askdb/rag` keeps describable text out of the index when the text names a sensitive column. Every piece of that text is checked against one list of names for the whole schema, whichever table or chunk the text belongs to.

| The column is | It is on the list as |
|---|---|
| Marked sensitive itself, in `schema.json` or in front-matter | Its bare name |
| Sensitive only because its table is | `table.column` only |
| Sensitive, in an untracked table | The same as above: its table is not indexed, but its data is still sensitive |
| In a schema built without the provenance field | Its bare name |

The loader records the provenance: `sensitiveFromTable` is set only on a column that is sensitive solely through its table. Core owns the list (ADR 0022). `docs/contracts/schema-v2.md` says how a qualified name matches.

## Why

- A list per table missed mentions across tables. Join guidance in `orders` that named `users.ssn` went into the index unchecked.
- Bare names for every column of a sensitive table excluded too much. A sensitive `users` table put `id` and `org_id` on the list, and the tenant policy text was dropped.
- Prose has no `FROM` clause, so the check cannot bind a bare name to a table as the SQL check does.
- The cost: a column marked sensitive itself with a generic name, such as `name`, excludes every text that says "name". No column can opt out.

## Options

| | Option | Why it lost |
|---|---|---|
| A | One schema-wide list, with table-inherited columns only as `table.column` | **Chosen.** |
| B | Keep the list per table for table text, and document the gap | Join guidance is a normal place to name another table's sensitive column, and that text is embedded unchecked. |
| C | Schema-wide bare names for every column, table-inherited columns included | Generic names such as `id` and `created_at` exclude most concepts and tenant policy text. |
| D | A bare name counts only when no non-sensitive column shares it | A name collision in another table weakens the author's own mark on a column. |
| E | Leave table-inherited columns off the list | A qualified mention such as `users.org_id` is not ambiguous, and it must count. |
| F | `@askdb/rag` infers the provenance from the table markdown | The chunker does not see the column flags in `schema.json`, and the loader is the one place that resolves sensitivity. |

## Keep

| Rule | Checked by |
|---|---|
| The check is never scoped per table. Text in one table that names another table's sensitive column is left out. | `packages/rag/src/chunker/chunker.test.ts` |
| A column sensitive only through its table matches as `table.column`, never by its bare name. | `packages/rag/src/chunker/chunker.test.ts`, `packages/core/src/schema/v2/mentions.test.ts` |
| A column marked sensitive itself matches by its bare name, also when its table is sensitive. | `packages/rag/src/chunker/chunker.test.ts`, `packages/core/src/schema/v2/mentions.test.ts` |
| The sensitive columns of an untracked table are on the list. | `packages/rag/src/chunker/chunker.test.ts`, `packages/core/src/schema/v2/mentions.test.ts` |
| The loader sets `sensitiveFromTable` only on a column that is sensitive solely through its table. | `packages/core/src/schema/v2/loader.test.ts` |
| A schema without that field reads each sensitive column as marked itself. | `packages/core/src/schema/v2/mentions.test.ts` |
| The list has one owner, in core. No package builds its own. | review |
