# ADR 0033: Error codes nothing reports leave before 1.0

**Status:** accepted · 2026-11-05

## Decision

Before 1.0, AskDB removes in one step a member of a public error-code union that none of its own code paths reports. The exception is a code whose rule is cheap to enforce now: AskDB then reports it. Each code is decided on its own. This is ADR 0031's rule, applied to the members of a union.

One code stays under the exception. A `global` tenant scope must give a `reason` that is not blank, and scope validation refuses a scope without one.

An internal parser keeps its reason strings in its own union, outside the public error types.

After 1.0, a new code is a minor and a removed code is a major.

## Why

- 1.0 freezes the public types. After it, the removal of a union member needs a major.
- A host that switches on the union writes branches that cannot run.
- A code that nothing reports promises a check that AskDB does not run.

## Options

| | Option | Why it lost |
|---|---|---|
| A | Remove the code, or report it when its rule is cheap to enforce | **Chosen.** |
| B | Report every code that nothing reports | Two tenant rules each need new guardrail logic, which is a larger change than the freeze allows. |
| C | Keep the codes as reserved for later use | The types keep the promise of checks that do not exist, and a host's exhaustive `switch` keeps dead branches through 1.x. |

## Keep

| Rule | Checked by |
|---|---|
| A public error-code union holds no code that AskDB never reports. A new code lands with the check that reports it. | review |
| Every error class and code has a row on its reference page, and every row names a declared class or code. | `apps/docs-site/scripts/check-error-reference.mjs` (`pnpm test:errors` in `apps/docs-site`) |
| Scope validation refuses a `global` scope whose `reason` is missing, blank or not a string. | `packages/core/src/sql/tenant-scope-validate.test.ts` |
| An internal parser's reason strings stay out of the public error types. | review |
