# ADR 0037: Introspection refuses an empty artifact

**Status:** accepted · 2026-11-06

## Decision

Introspection never writes a schema artifact with no tables. The renderer that every `schema.json` comes from throws `EmptyIntrospectionError` when the rendered table list is empty.

The check counts the rendered tables, not what the connector reports. A source that holds only enums or sequences is refused too. The check runs before the merge with an existing artifact, so that artifact stays as it was.

The message names the schema id, the engine and the filters, and it lists the likely causes. It never repeats the connection. `askdb introspect` exits `1` in every output mode, and Studio answers `422`.

## Why

- Schema v2 requires one table or more, and the loader rejects an artifact without one. Introspection wrote that artifact and reported success.
- The user saw the failure one command later, in an error that did not mention introspection.
- A second introspection of a database that had lost its tables replaced a valid artifact, and logged nothing.

## Options

| | Option | Why it lost |
|---|---|---|
| A | Introspection refuses to write an empty artifact | **Chosen.** |
| B | The schema contract allows zero tables | An artifact with no tables cannot answer a question, so every consumer needs its own behaviour for it, and the failure moves later. |

## Keep

| Rule | Checked by |
|---|---|
| No output mode writes or prints an artifact with no tables: `--out`, `--print` and `--diff`. | `packages/introspect/src/introspect.test.ts`, `apps/cli/src/introspect-registry.test.ts` |
| The check counts the rendered tables, so a source with only enums or sequences is refused. | `packages/introspect/src/introspect.test.ts` |
| An existing artifact stays as it was when a new introspection finds no tables. | `packages/introspect/src/introspect.test.ts`, `apps/studio/src/server.test.ts` |
| The message names the schema id, the engine and the filters, and nothing from the connection. | `packages/introspect/src/introspect.test.ts`, `apps/cli/src/introspect-registry.test.ts` |
| `askdb introspect` exits `1`, and Studio answers `422`, for a source with no tables. | `apps/cli/src/introspect-registry.test.ts`, `apps/studio/src/server.test.ts` |
| The Schema v2 contract still requires one table or more (`docs/contracts/schema-v2.md`). | review |
