# ADR 0021: Studio's tenant-policy draft uses core's prompt formatter

**Status:** accepted · 2026-11-04

## Decision

Studio's **Draft with AI** builds its prompt from the schema that `loadSchema()` returns. It lists tables, columns and foreign keys with core's `formatSchemaV2ForNlToSql`, over a copy of the tracked tables that keeps only the physical fields.

So the draft follows the rule that `ask()` follows. A sensitive column is tagged by default. With `modes.omitSensitiveFromPrompt` on, the column is withheld. The draft sends no describable text.

When omission withholds a primary key, or a foreign key that touches a withheld column, Studio names the key in the response's `warnings`. The review screen shows the warnings in a card. Studio writes them, never the model, and nothing is added to the draft body.

## Why

- The draft once built its prompt from raw `schema.json`. It listed every column and ignored the sensitive flags, the front-matter escalation and the omission setting.
- A sensitive table's keys are sensitive too. A withheld key can hide a column that the policy needs, so the user must see which keys the model did not get.

## Options

| | Option | Why it lost |
|---|---|---|
| A | Core's formatter, with withheld keys reported as warnings | **Chosen.** |
| B | Always withhold sensitive columns in the draft, whatever the mode | It makes a second rule beside the rule for `ask()`, and hides keys the operator chose to send tagged. |
| C | Keep Studio's own schema rendering and copy the omission rule into Studio | The tag, the placeholder line and the omission rule would have two homes. |
| D | Put a note about withheld keys in the draft body | The note is saved to `tenant-policy.md`, which RAG indexes, and it sits inside text the model wrote. |
| E | Withhold silently | The draft cannot scope a table through a withheld key, and nothing says why. |

## Keep

| Rule | Checked by |
|---|---|
| The draft's schema text comes from core's formatter. Studio renders no table, column or foreign-key line of its own. | review |
| With omission on, the draft prompt names no sensitive column: flagged in `schema.json`, escalated in front-matter, or inherited from a sensitive table. | `apps/studio/src/server.test.ts` |
| With omission off, the draft prompt tags each sensitive column. | `apps/studio/src/server.test.ts` |
| The draft prompt holds no describable text and no untracked table. | `apps/studio/src/server.test.ts` |
| A withheld primary key or foreign key is named in `warnings`. A withheld column that is not a key is not. | `apps/studio/src/server.test.ts` |
| The notice about withheld keys is never written into the draft body. | review |
