# ADR 0049: The Quickstart offers a fetchable example, kept equal to the page

**Status:** accepted · 2026-11-14

## Decision

`examples/quickstart-shop` holds the files that the Quickstart has the reader type, a `package.json` and a README. The page links the folder at the top, with one command that fetches it. The hand-typed tutorial stays the main path.

The folder is outside the pnpm workspace, so it installs `askdb` from the registry, as a reader does. Its `askdb` range is a caret range on the current release line. No file that the commands generate is committed.

Two checks keep the example equal to the page. A unit test compares the files with the page. A smoke check runs the example from the packed tarballs.

## Why

- A reader typed three files by hand before the first answer. No folder in `examples/` matched the page.
- The folder reuses `examples/` and the existing smoke test, so it adds no second repository and no CLI flag.
- A copy of the page's code drifts unless a check compares the two.

## Options

| | Option | Why it lost |
|---|---|---|
| A | An example folder in this repo, linked from the page and checked in CI | **Chosen.** |
| B | Keep the tutorial only | A reader still types every file. |
| C | A separate template repository | It is a second repository to keep in step with each release. |
| D | `askdb init --sample`, which writes the shop database | It adds a CLI flag after the 1.0 API freeze, which is the maintainer's decision. |

## Keep

| Rule | Checked by |
|---|---|
| Each file in the example equals the page's code block for it. A change to one changes the other in the same PR. | `apps/cli/src/quickstart-example.test.ts` |
| Each command in the example's README appears on the page. | `apps/cli/src/quickstart-example.test.ts` |
| The example's `askdb` range admits the CLI's current version. | `apps/cli/src/quickstart-example.test.ts` |
| The example runs from the packed tarballs, and its rows equal the table on the page. | `examples/installable-smoke/quickstart-example.sh` |
| The folder stays outside the pnpm workspace. | review |
| No generated file is committed: no database, no `.env`, no config file and no schema artifact. | review |
| The tutorial stays the main path. The example is a shortcut that the page links. | review |
