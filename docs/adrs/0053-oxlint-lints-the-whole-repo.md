# ADR 0053 — oxlint lints the whole repo, with warnings denied

## Status

Accepted (2026-11-20). The maintainer approved the switch, with whole-repo coverage, in the thread that planned the comment rules built on it (#1071). Supersedes nothing.

## Context

Before this change, only Studio ran a linter: ESLint with `typescript-eslint`'s recommended rules and `import-x/no-unresolved`. Every other package's `lint` task was `tsc --noEmit`, and the docs site ran `astro check`. So unused imports and similar mistakes in `packages/*` reached `main` without a check. Studio's setup needed five dev dependencies, a pnpm hook (`.pnpmfile.cjs`) to patch the import resolver's peers, and a build allowance for `unrs-resolver`.

The repo also wants custom lint rules that read code comments (for example, a comment that puts work off must name an issue). Those rules matter most in `packages/core`, where ESLint never ran.

## Options considered

- **A. oxlint at the root, over the whole repo, with warnings denied (chosen).** One config and one dev dependency. It lints the full repo in about a second. Its JS plugins use ESLint's rule API, so a custom rule written for it also runs under ESLint.
- **B. ESLint rolled out to every package.** It has the most rules and plugins. But it means one config per package or a large shared config, more dependencies, and a type-aware setup per `tsconfig`.
- **C. Keep ESLint in Studio only.** No work now. But the packages stay unlinted, and comment rules would need a separate script.

## Decision

1. `oxlint` is a root dev dependency, pinned to an exact version at or above 1.94.0, the first version where `jsPlugins` was confirmed to work.
2. One config, `.oxlintrc.json`, sits at the repo root. It uses the default plugins (`eslint`, `typescript`, `unicorn`, `oxc`) and sets the `correctness` category to `error`.
3. `pnpm lint` runs `pnpm lint:oxlint` (`oxlint --deny-warnings`) before `turbo run lint`. CI's `lint` job runs `pnpm lint`.
4. A warning is either fixed or allowed on its line with `oxlint-disable-next-line <rule> -- <reason>`. Rules are not turned off for the whole repo to clear existing warnings.
5. `import-x/no-unresolved` has no replacement. Studio's `tsc -p tsconfig.web.json --noEmit` already fails on an import it can't resolve.

## Consequences

- Every package is linted, not only Studio. A new warning anywhere fails `pnpm lint` and CI.
- Custom rules go in the root config's `jsPlugins`.
- ESLint stays in the lockfile through `react-doctor`, so the `minimatch` overrides for `eslint` and `@eslint/config-array` stay until those packages accept minimatch 11.
- oxlint's type-aware rules are a separate mode and are not used. Adopting them is a new decision.
- Raising the oxlint pin is a deliberate change: a new version can add rules to `correctness` that fail CI.
