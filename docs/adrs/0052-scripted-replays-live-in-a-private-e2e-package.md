# ADR 0052: Scripted replays live in a private `e2e` package

**Status:** accepted · 2026-11-19

## Decision

The journeys that the `verify-askdb` skill has proven have a scripted form, a replay, which CI runs without a model. The replays live in `e2e/`, a private workspace package (`@askdb/e2e`) that is never published. The package also holds the harness and the fake model, which the skill's agent runs share.

Vitest runs the CLI and HTTP API replays. Playwright runs the Studio replays. One command, `pnpm e2e`, runs both through a Turbo task that is not cached.

CI runs the replays on every PR that is not docs-only. The skill folder keeps the playbook and the feature map, which marks each sub-feature as scripted or agent-driven.

## Why

- An agent run costs model tokens, needs a strong model to judge the result, and does not give the same result every time.
- A journey crosses apps: the CLI writes the schema that Studio and the HTTP API then read. One package owns the journey and the shared harness.
- Playwright is needed only where there is a browser. Vitest is the repo's runner everywhere else.
- A docs-only filter fails closed: a path it does not know runs the replays.

## Options

Where the replays live:

| | Option | Why it lost |
|---|---|---|
| A | A private workspace package, `e2e/` | **Chosen.** |
| B | The skill folder | It puts test code outside the workspace, where no package owns it. |
| C | A test folder in each app | It splits one journey across three folders, and the shared harness has no owner. |

Which runners:

| | Option | Why it lost |
|---|---|---|
| A | Vitest for the CLI and HTTP API, Playwright for Studio | **Chosen.** |
| B | Playwright Test for all three | Playwright adds nothing for a CLI process, and it would be the one suite for non-browser code that Vitest does not run. |

When CI runs them:

| | Option | Why it lost |
|---|---|---|
| A | Every PR that is not docs-only, by the consumer lab's filter | **Chosen.** |
| B | Turbo's `--affected` | Its treatment of files outside every package, which the replays read, is untested. |
| C | A path allow-list | It fails open: a PR that breaks a journey through a path outside the list skips the gate. |

## Keep

| Rule | Checked by |
|---|---|
| A replay always uses the fake model. | review |
| A Studio replay finds controls by role and accessible name only. A journey that needs anything else stays agent-driven. | review |
| Every journey lives in the one `e2e/` package, which stays private. | review |
| The `e2e` Turbo task stays uncached: the replays read files outside the package that Turbo does not hash for it. | review |
| CI runs the replays on every PR that the consumer lab's docs-only filter does not skip. A change to that filter changes both jobs. | review |
| A move to `--affected` first needs a test on a PR that changes only files outside every package. | review |
| The skill folder holds the playbook and the feature map only. Each sub-feature in the map says scripted, with its replay, or agent-driven. | review |
| A PR that renames a Studio control updates the replay and the feature file. | review |
