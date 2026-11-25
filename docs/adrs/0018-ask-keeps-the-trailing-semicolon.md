# ADR 0018: `ask()` keeps one trailing semicolon

**Status:** accepted · 2026-10-07

## Decision

`ask()` returns the statement as the model wrote it, trimmed. One trailing `;`, and any whitespace before it, stays. Any other `;` outside a string or a quoted name fails the single-statement check.

Each SQL output keeps the `;` of the model block it comes from. AskDB does not make the outputs agree when the model's two blocks differ. A rebind keeps the `;` of the stored template.

A host that wraps the statement, for example in a subquery for a row cap, removes the `;` first.

## Why

- AskDB returns SQL and never runs it. A statement shaped for a subquery wrap is the host's business.
- A silent edit means that the SQL returned is not the SQL the model wrote. A host that wraps the statement must know about the edit anyway.

## Options

| | Option | Why it lost |
|---|---|---|
| A | Keep the `;`, and the host removes it when it wraps the statement | **Chosen.** |
| B | Remove the `;` in core | It shapes the statement for one way to run it, and the edit is silent. |

## Keep

| Rule | Checked by |
|---|---|
| The read-only check returns the SQL trimmed, with one trailing `;` kept. | `packages/core/src/sql/validate.test.ts` |
| A `;` anywhere else fails the single-statement check. | `packages/core/src/sql/validate.test.ts`, `packages/core/src/ask.test.ts` |
| `sql`, `unboundSql` and `preparedQuery.namedSql` each keep the `;` of their own model block. The check that compares the two blocks ignores the terminator. | `packages/core/src/ask.test.ts` |
| A rebind keeps the template's `;` in `sql` and `unboundSql`. | `packages/core/src/sql/bind.test.ts` |
| The CLI prints `sql` as returned and adds no `;`. | `apps/cli/src/spawn-logs.test.ts` |
| Studio's Execute removes the `;` before it wraps the statement. | `apps/studio/src/execute-registry.unified.test.ts` |
| Code and docs remove the terminator with `/;$/` on the trimmed SQL. A pattern that starts with `\s*` takes quadratic time on a run of whitespace. | `apps/studio/src/execute-registry.unified.test.ts`, `packages/core/src/ask.test.ts`; review for docs |
| The consumer lab compares SQL without one trailing `;` on either side. | `examples/consumer-lab/test/cassette-sql.test.ts` |
