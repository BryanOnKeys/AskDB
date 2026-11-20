# ADR 0052 — Scripted replays of the verify-askdb feature map live in a private `e2e` package, run on every PR

## Status

Accepted (2026-11-19), amended 2026-11-20 (the filter job's name). The maintainer chose these options in the review of #1043 (Q1 a private package, Q2 Vitest for the CLI and HTTP API with Playwright for Studio, Q3 every PR). Supersedes nothing.

## Context

The `verify-askdb` skill (`.agents/skills/verify-askdb/`) is a playbook an agent follows to drive AskDB the way a user does: the `askdb` CLI, the HTTP API and Studio, in a disposable project with a fake OpenAI endpoint. An agent run is useful for new and changed behaviour, but it costs model tokens, needs a strong model to judge the result, and doesn't give the same result every time. The journeys it has already proven needed a scripted form that CI runs without a model.

A journey crosses apps. `askdb introspect` writes the schema that `askdb ask`, `askdb rag` and every Studio screen then read, and Studio's Playground runs SQL against the database the CLI introspected. The replays also share one harness with the skill, so a scripted journey and an agent drive start from the same state.

## Options considered

- **Where the replays live**
  - **A. A private workspace package, `e2e/`, holding the harness, the fake model and the replays (chosen).** One home for cross-app journeys. Turbo knows its dependencies (`askdb`, `@askdb/http-api`, `@askdb/studio`), so it builds them first and can tell which PRs affect it.
  - **B. The skill folder.** It keeps the playbook and the code together, but it puts test code outside the workspace, where no package owns it.
  - **C. A test folder in each app.** It matches how unit tests are placed, but it splits one journey across three folders, and the shared harness has no owner.
- **Which runners**
  - **A. Vitest for the CLI and HTTP API, Playwright for Studio, both under one `pnpm e2e` command (chosen).** Vitest is the repo's runner, and its CLI spawn tests and CI reporters already work this way. Playwright is needed only where there is a browser.
  - **B. Playwright Test for all three.** One runner and one report, but Playwright adds nothing for a CLI process, and it would be the only non-Vitest suite for non-browser code.
- **When CI runs them**
  - **A. Every PR that isn't docs-only (chosen).** The same docs-only filter as the consumer lab (the `changes` job; see the amendment below). It fails closed: an unknown path runs the replays.
  - **B. Turbo's `--affected`.** It selects `e2e` when a package it depends on changes, but how it treats files outside every package (`fixtures/`, `examples/quickstart-shop/shop.sql`, which the replays read) is untested.
  - **C. A path allow-list.** It fails open: a PR that breaks a journey through a path outside the list skips the gate.

## Decision

1. `e2e/` is a private workspace package (`@askdb/e2e`, never published). It holds the harness (`e2e/harness/askdb-run.mjs`, the `AskdbRun` class), the agent's command line over it (`e2e/harness/control-askdb.mjs`), the fake OpenAI endpoint, the Vitest replays (`e2e/cli`, `e2e/api`, `e2e/studio/*.test.ts`) and the Playwright replays (`e2e/studio/*.spec.ts`).
2. The skill folder keeps the playbook only: `SKILL.md` and the feature map, where each sub-feature is `Scripted: <replay>` or `Agent-driven.` An agent drives what a change touches and what a replay flagged, and writes a replay for each journey it has proven and whose UI has stopped changing.
3. `pnpm e2e` runs the Turbo task `e2e` (`dependsOn: ["^build"]`, `cache: false`) for `@askdb/e2e`: Vitest, then Playwright. The task isn't cached because the replays read files Turbo doesn't hash for this package (`fixtures/schemas`, `examples/quickstart-shop/shop.sql`), so a cached pass could be stale.
4. CI's `e2e` job runs `pnpm e2e` after installing Playwright's Chromium, on every PR the `changes` job doesn't mark docs-only, and uploads the evidence and Playwright's report as the `e2e-evidence` artifact.
5. Replays always use the fake model and find Studio's controls by role and accessible name only. A replay that needs anything else stays agent-driven.

## Consequences

- A change that breaks a scripted journey fails CI with no model involved. A UI change that renames a control fails the replay too, and its PR updates the replay and the feature file.
- Every non-docs PR pays for a Chromium install and the replays, about a minute in CI.
- The `e2e` job reads the consumer lab's docs-only filter. A change to that filter changes when the replays run too.
- Studio controls with no accessible name can't be scripted until the product names them. Those sub-features stay agent-driven, and the feature file says why.
- Moving to `--affected` later needs a test on a PR that changes only files outside every package first.

## Amendments

### Amendment (2026-11-20): the filter job is `changes`

The docs-only filter moved from the `lab-changes` job into the `changes` job (`scripts/ci-changes.sh`, #1074), which also feeds the audit and preflight filters. The rule is unchanged, and the decision stands.
