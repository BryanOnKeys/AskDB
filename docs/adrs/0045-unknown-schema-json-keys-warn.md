# ADR 0045: Unknown keys in `schema.json` warn

**Status:** accepted · 2026-11-08

## Decision

When `schema.json` holds a key that AskDB does not define, the load goes on and returns one `unknown_key` warning for the key. The warning names the key, where it is, and the known key it is closest to, when one is close. AskDB still ignores the key. It never applies the suggested key.

The check covers every level of `schema.json`: the top level, tables, columns and relationships. A schema directory and its bundle warn alike and load to the same schema.

## Why

- A misspelled `"sensitve": true` loaded without a word, marked nothing, and left the column unprotected.
- The schema v2 contract lets a release add fields to the physical layer in place. An older AskDB must still load an artifact written for a newer one.
- A guess at the key the author meant would mark or unmark sensitivity on AskDB's guess.

## Options

| | Option | Why it lost |
|---|---|---|
| A | Warn, name the closest known key, and keep loading | **Chosen.** |
| B | Fail the load, on every unknown key or on a near miss of a known one | An artifact with a newer additive field stops loading on an older AskDB. A near-miss rule still lets other typos through without a word. |
| C | Warn and apply the suggested key | AskDB would mark or unmark sensitivity on a guess. The author fixes the key. |
| D | Keep dropping the key without a word | That is the defect. |

## Keep

| Rule | Checked by |
|---|---|
| An unknown key at any level of `schema.json` gives one warning, and the load goes on. | `packages/core/src/schema/v2/loader.test.ts` |
| AskDB never applies a suggested key: a column with a misspelled flag stays unprotected until the author fixes it. | `packages/core/src/schema/v2/loader.test.ts` |
| A bare `schema.json`, a directory and its bundle give the same warnings and the same schema. | `packages/core/src/schema/v2/loader.test.ts` |
| The check visits every nested object level that the zod schema of `schema.json` defines. | `packages/core/src/schema/v2/loader.test.ts` |
| The warning's shape is public `@askdb/core` API, frozen with the 1.0 line (ADR 0030). | `packages/core/src/public-api.test.ts` |
| Studio's workspace carries the loader's warning to the author. | `packages/enrich/src/workspace.test.ts` |
