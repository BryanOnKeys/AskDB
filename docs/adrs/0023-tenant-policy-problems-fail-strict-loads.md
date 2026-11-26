# ADR 0023: Tenant policy problems fail strict loads

**Status:** accepted · 2026-09-29

## Decision

The policy's own `enforcement` decides what a mismatch between `tenant-policy.md` and `schema.json` does at load time.

| The policy has | Under `strict` | Under `warn` |
|---|---|---|
| A column or foreign key ID that `schema.json` does not have | The load throws | Warning |
| A column that `schema.json` has on another table than its entry names | The load throws | Warning |
| A hierarchy cycle | The load throws | Warning |
| A root that the policy names but `roots` does not declare | The load throws | Warning |
| An entry for a table that `schema.json` no longer has | Warning | Warning |

The check lives in one place, `normalizeTenantPolicy` in core. The directory loader, the bundle loader and `saveTenantPolicy` in `@askdb/enrich` all refuse the same policies.

Warnings reach the host three ways: on `schema.tenantPolicy.warnings`, in one `ask()` log event for each loaded schema, and on stderr from the CLI.

## Why

- Nothing outside Studio read the policy's problems. A strict policy with a renamed scope column or a cycle loaded with no error.
- Under `strict`, tenant checks against a policy with wrong scope columns give a silent fail-open.
- `warn` exists to adopt a policy step by step. A host that chose it asked for findings, not refusals.
- An entry for a removed table scopes nothing: its columns went with the table.

## Options

| | Option | Why it lost |
|---|---|---|
| A | The policy's `enforcement` decides: `strict` fails the load, `warn` loads and reports | **Chosen.** |
| B | Errors in every mode | A host that chose `warn` asked for findings, not refusals. |
| C | Warnings in every mode, shown in logs and the CLI | Under `strict`, tenant checks would run against a policy with wrong scope columns or a wrong hierarchy. |
| D | Studio's save checks the policy against the workspace in memory | A stale workspace rejects a fix that matches the new `schema.json` on disk. |

## Keep

| Rule | Checked by |
|---|---|
| A strict policy never loads with a missing or misplaced column, a cycle or an undeclared root. The error names the file and the IDs. | `packages/core/src/schema/v2/loader.test.ts`, `packages/core/src/schema/v2/tenant-policy.test.ts` |
| An entry for a removed table stays one warning in every mode, and the schema loads. | `packages/core/src/schema/v2/loader.test.ts` |
| Under `warn`, every problem loads as a warning. | `packages/core/src/schema/v2/tenant-policy.test.ts`, `packages/core/src/schema/v2/schema-evolution.test.ts` |
| The check stays in `normalizeTenantPolicy`, so every loader and Studio's save refuse the same policies. | review |
| Cycle detection walks every parent edge, because a root can have more than one parent. | `packages/core/src/schema/v2/tenant-policy.test.ts` |
| A column's table comes from `schema.json`, never from a split of the ID: a table name can hold `#`. | `packages/core/src/schema/v2/tenant-policy.test.ts` |
| `saveTenantPolicy` checks the policy against `schema.json` on disk. | `packages/enrich/src/workspace.test.ts` |
| `ask()` logs the policy's warnings once for each loaded schema, at `warn` level. The event holds table IDs, column IDs and mapping keys only, never query text or row values. | `packages/core/src/ask.test.ts`; review for the event's content |
| `askdb ask` and `askdb bundle` print each warning as one line on stderr and keep their exit code. | `apps/cli/src/ask.test.ts`, `apps/cli/src/bundle.test.ts` |
| `askdb introspect --out` reports a policy that no longer matches the new `schema.json`, and exits 0. | `apps/cli/src/introspect-registry.test.ts` |
| This check reads `enforcement` before any SQL exists. For findings about SQL, ADR 0010's decision point stays the only reader. | review |
