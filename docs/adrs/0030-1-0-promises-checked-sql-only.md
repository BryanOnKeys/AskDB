# ADR 0030: 1.0 promises checked SQL only

**Status:** accepted · 2026-11-05

## Decision

1.0 promises checked SQL. The library, the CLI and the HTTP API return checked SQL and never execute it. Studio's Playground **Execute** stays a local development tool that is off by default.

Reports, result summaries, a non-stub `bounded_results` and a first-party MCP server come after 1.0, as additions in a minor release. All five engine families are supported at 1.0: PostgreSQL, MySQL, MariaDB, SQLite and SQL Server.

| Set | What is in it | A breaking change is |
|---|---|---|
| The 1.0 set | `@askdb/core`, `@askdb/client`, `@askdb/config`, `@askdb/ai`, `askdb`, `@askdb/http-api`, `@askdb/introspect`, `@askdb/postgres`, `@askdb/mysql`, `@askdb/sqlite`, `@askdb/sqlserver`, `@askdb/prisma` | A major |
| The 0.x set | `@askdb/studio`, `@askdb/enrich`, `@askdb/rag` | A minor |
| Experimental surfaces inside the 1.0 set | The `studio` and `rag` blocks of `defineConfig`, with the types and environment variables that feed them. The `askdb studio`, `enrich`, `bundle` and `rag` commands. The RAG and Studio flags of `askdb init`, and the sections they write. The `@askdb/config/scaffold` entry point. The `@askdb/client/charts` entry point. | A minor of `askdb`, `@askdb/config` or `@askdb/client` |

`1.0.0-rc.1` freezes the public API of the 1.0 set. The schema artifact format (Schema v2) is the one exception: it can change until 1.0.0 stable.

## Why

- Reports and summaries send a host's rows to a model. That trust surface is not built, and its contract would freeze at 1.0 with no test.
- Agents already reach the same core and the same SQL checks through the CLI and the HTTP API. An MCP server adds a third contract to freeze.
- Studio, `@askdb/enrich` and `@askdb/rag` still change. At 1.0, each routine change there needs a major version.

## Options

| | Option | Why it lost |
|---|---|---|
| A | Checked SQL only, with a 1.0 set and a 0.x set | **Chosen.** |
| B | Reports and result summaries at 1.0 | They need consent, a projection of sensitive columns and budgets for rows, columns and bytes, and none of it is built. |
| C | An MCP server at 1.0 | It delays the release candidate and adds no capability that agents lack. |
| D | Every published package at 1.0 | The authoring and RAG APIs must then stop changing, or each change needs a major. |

## Keep

| Rule | Checked by |
|---|---|
| Docs, the README and the docs site never present reports, result summaries or MCP as 1.0 features. | review |
| A path that makes AskDB execute generated SQL, beyond Studio's local Playground, needs a new ADR that supersedes this one and ADR 0012. | review |
| After 1.0.0, a breaking change to the 1.0 set is a major, unless it stays inside an experimental surface. | review |
| A breaking change to an experimental surface has a changeset that names `askdb`, `@askdb/config` or `@askdb/client` as `minor`. | review |
| The CLI help marks the experimental commands and flags, and only those. | `apps/cli/src/spawn-help.test.ts` |
| The docs-site reference and the `@askdb/config` types mark each experimental surface. | review |
| `@askdb/client` does not re-export the charts entry point from its root. | `packages/client/src/public-api.test.ts` |
| `bounded_results` stays a published mode, so a host that sets it today keeps working when reports ship. | `packages/core/src/modes/types.test.ts` |
| A Schema v2 change before 1.0.0 ships in a release candidate with an upgrade note. From 1.0.0, a breaking change needs `version: 3`. | review |
| A package that joins the 1.0 set needs a new ADR and a change to the `fixed` group (ADR 0035). So does a 0.x package that moves to 1.0. | review |
| The consumer lab runs each of the five engine families. | review |

This ADR does not cover CockroachDB: ADR 0029 records its status. ADR 0044 decides what the charts entry point sends to a model.
