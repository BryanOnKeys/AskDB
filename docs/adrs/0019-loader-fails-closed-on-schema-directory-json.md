# ADR 0019: The loader fails closed on a stray JSON file in a schema directory

**Status:** accepted · 2026-11-04

## Decision

Inside a schema directory, the JSON file that `loadSchema()` reads must be `schema.json`. `loadSchema()` handles a JSON file path in one of four ways:

| The path is | `loadSchema()` |
|---|---|
| `schema.json`, in any case | Loads the enclosing directory, with its sibling files. |
| A bundle | Loads it wherever it sits: a bundle holds all its parts. |
| Another JSON file, with `tenant-policy.md`, `tables/` or `concepts.md` beside it in any case | Throws, and names the file and the siblings. |
| Another JSON file, with none of them beside it | Loads it as a physical layer only. |

`loadSchemaFromJson()` stays the way to read only a physical layer, wherever the file sits.

## Why

- A copy such as `prod-schema.json` loaded without its siblings. The tenant policy and every `sensitive: true` in `tables/*.md` were dropped, with no error.
- A dropped tenant policy means that `ask()` stops requiring a tenant scope. A file in that position is a mistake, so the load must refuse it.

## Options

| | Option | Why it lost |
|---|---|---|
| A | Throw when `tenant-policy.md`, `tables/` or `concepts.md` sits beside the file | **Chosen.** |
| B | Throw only for `tenant-policy.md` | A `tables/` beside the file still drops every `sensitive: true` in table front-matter. |
| C | Throw for `tenant-policy.md` and `tables/`, not `concepts.md` | The rule has two parts to explain, and a lone `concepts.md` is still dropped silently. |
| D | Load the file with a warning | A warning is easy to miss, so tenant enforcement still turns off. |

## Keep

| Rule | Checked by |
|---|---|
| A JSON file in a schema directory never loads without its siblings. There is no warning-only fallback. | `packages/core/src/schema/v2/loader.test.ts` |
| The guard counts a sibling in any case (ADR 0027). | `packages/core/src/schema/v2/loader.test.ts` |
| A path named `schema.json` in any case loads its directory, and the physical layer comes from the path given. | `packages/core/src/schema/v2/loader.test.ts` |
| A JSON file with no sibling schema files loads as a physical layer only. | `packages/core/src/schema/v2/loader.test.ts` |
| A directory path needs a file named exactly `schema.json` (ADR 0027). | `packages/core/src/schema/v2/loader.test.ts` |
