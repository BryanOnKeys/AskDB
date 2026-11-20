# ADR 0031: Unused exports leave before 1.0

**Status:** accepted · 2026-11-05

## Decision

Before 1.0, AskDB removes in one step a public export that nothing outside its own package uses. "Outside" counts the other packages, the apps, the examples and the consumer lab. The rule also covers an export that an API page documents or lists as internal. The upgrade notes of a minor changeset name each export and its replacement.

Each export is decided on its own. An export that hosts are known to use is deprecated first.

An engine package's catalog SQL is internal. It is public only when the engine has a mode in which a person runs the queries. Today that is the from-export mode of `@askdb/postgres`.

An experimental entry point (ADR 0030) can change or drop an export in a minor, after 1.0 too, with no deprecation first.

## Why

- 1.0 freezes the public API. After it, the removal of an export needs a major.
- A deprecation needs a second release. If that release comes after rc.1, the export stays frozen until 2.0.
- A public catalog query makes every fix to that query a change to public API.

## Options

| | Option | Why it lost |
|---|---|---|
| A | Remove an unused export in one step, and keep catalog SQL internal unless a mode hands it to a person | **Chosen.** |
| B | Deprecate now, and remove later | The removal needs a second release that no issue owns, and after rc.1 it waits for 2.0. |
| C | Make only the MySQL catalog SQL internal | SQLite and SQL Server carry the same export, with no page that documents it. |
| D | Document every engine's catalog SQL as public | No mode of those engines hands the queries to a person, and every catalog fix becomes an API change. |

## Keep

| Rule | Checked by |
|---|---|
| An export that this rule removed stays removed. | `packages/core/src/public-api.test.ts`, `packages/config/src/public-api.test.ts`, `packages/ai/src/public-api.test.ts`, `packages/introspect/src/public-api.test.ts` |
| An engine package exports its catalog SQL only when it has a mode that hands the queries to a person. | review |
| A unit test reads catalog SQL from the connector module of its own engine, never through the package entry. | review |
| An internal export that another AskDB package, app or example imports stays until it has another home. | review |
| An experimental entry point exports only what a host needs: an export can be added later, but not taken back. | `packages/client/src/public-api.test.ts` |

A function that a module exports only for its own package is not public API. It can lose `export` at any time. ADR 0033 applies the same rule to the members of an error-code union.
