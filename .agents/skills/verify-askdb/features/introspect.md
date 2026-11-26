# Introspect a database

`askdb introspect` reads a live database's catalog and writes the schema folder every other feature reads (`schema.json`). It can also print the schema JSON or report whether an existing folder is out of date. Without the multi-engine fixture, SQLite is the engine to drive.

## Sub-features

- `introspect-write` writes `schema.json` for the configured SQLite file into an output folder. Scripted: `e2e/cli/introspect.test.ts`.
- `introspect-print` prints the schema JSON on stdout without writing a folder. Scripted: `e2e/cli/introspect.test.ts`.
- `introspect-diff` reports `changed` against an existing schema folder. Scripted: `e2e/cli/introspect.test.ts`.
- `introspect-templates` prints the catalog SQL for Postgres, and refuses an engine that has no templates. Scripted: `e2e/cli/introspect.test.ts`.

## How to get to it (user POV)

- Run `askdb introspect` in a project whose config sets `introspection.provider` and its connection.
- Run `askdb introspect --engine sqlite --url <file> --out <dir>` to name them.
- Add `--print`, or `--diff <existing-dir>`.
- Run `askdb introspect templates --engine postgres`.

## Driving it with control-askdb

Preconditions:

- Baseline from the README. Nothing has been written to `askdb/` yet in this run.

- **Write.** Run `vctl cli --label introspect-write -- introspect --engine sqlite --url shop.db --out askdb`. Exit `0`; stderr is `Wrote askdb/schema.json: 3 tables (sqlite).`
- **Second view.** Read `<project>/askdb/schema.json` (the project path is printed by `vctl setup`). It lists the tables `customers`, `products` and `orders`.
- **Config defaults.** Run `vctl cli --label introspect-config -- introspect`. Exit `0`, with the same `Wrote askdb/schema.json` line: the engine, file and folder came from `askdb.config.ts`.
- **Print.** Run `vctl cli --label introspect-print -- introspect --engine sqlite --url shop.db --print`. Exit `0`; stdout is schema JSON naming `customers`.
- **Diff, unchanged.** Run `vctl cli --label introspect-diff -- introspect --engine sqlite --url shop.db --diff askdb`. Exit `0`; stdout is JSON with `"changed": false`.
- **Templates.** Run `vctl cli --label introspect-templates -- introspect templates --engine postgres`. Exit `0`; stdout is catalog SQL starting `-- schemas`, with `FROM pg_catalog.pg_namespace`. With `--engine sqlite` the exit is `1` and stderr says templates are `currently supported only for --engine postgres.`

## Gotchas

- No SQLite database is committed: `vctl setup` builds `shop.db` from `examples/quickstart-shop/shop.sql`. A missing `shop.db` means setup failed.
- Postgres, MySQL and SQL Server need the shared multi-engine fixture. Its containers are shared with other agents, so read the consumer-lab skill's guardrails before you start or reset it.
- `--diff` compares against the folder as written. Edit a copy, not `askdb/`, when you want to see `"changed": true`.
