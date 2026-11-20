# ADR 0053: oxlint lints the whole repo, and a warning fails the build

**Status:** accepted · 2026-11-20

## Decision

One linter, oxlint, checks every package and app in the repo. It is a root dev dependency, pinned to an exact version, with one config file: `.oxlintrc.json` at the root.

`pnpm lint` runs oxlint with warnings denied before the TypeScript checks, and CI runs `pnpm lint`. A warning is fixed, or allowed on its own line with a reason.

Custom rules are JS plugins in the root config. Studio's ESLint is gone, and `tsc` catches an import that does not resolve.

## Why

- Before this, only Studio had a linter. Mistakes such as unused imports in `packages/*` reached `main` with no check.
- One config at the root is cheaper to keep than a config for each package. oxlint checks the whole repo in about a second.
- The repo wants rules that read code comments, mostly in `packages/core`. oxlint's JS plugins use ESLint's rule API, so a rule can move to ESLint unchanged.
- A rule turned off for the whole repo hides new mistakes. An allow on one line shows the exception where it is.

## Options

| | Option | Why it lost |
|---|---|---|
| A | oxlint at the root, over the whole repo, with warnings denied | **Chosen.** |
| B | ESLint in every package | More configs and dependencies, and a type-aware setup for each `tsconfig`, for rules the repo does not need yet. |
| C | Keep ESLint in Studio only | The packages stay unchecked, and comment rules would need a separate script. |

## Keep

| Rule | Checked by |
|---|---|
| `pnpm lint` runs `oxlint --deny-warnings` before `turbo run lint`, and CI runs `pnpm lint`. | CI `lint` job |
| The repo has one oxlint config, at the root. | review |
| A warning is fixed or allowed on its line with a reason. No rule is turned off repo-wide to clear existing warnings. | review |
| oxlint is pinned to an exact version, 1.94.0 or later, so JS plugins work. A new pin is a deliberate change. | review |
| No package adds its own linter config. | review |
