# Ask from the CLI

`askdb ask` turns a natural-language question into SQL for a schema folder. It prints the SQL after `-- sql --` on stdout, warns on stderr when the SQL names a sensitive column, and refuses SQL that isn't a read-only `SELECT`/`WITH`, with exit 1.

## Sub-features

- `ask-generate` prints the model's SQL for a question, after the schema and question reach the model. Scripted: `e2e/cli/ask.test.ts`.
- `ask-refuse-write` refuses a non-read-only reply with `SqlValidationError` and exit 1. Scripted: `e2e/cli/ask.test.ts`.
- `ask-sensitive-warning` warns on stderr when the SQL references a sensitive column, and still exits 0. Scripted: `e2e/cli/ask.test.ts`.
- `ask-explain` adds an `-- explain --` block with the checks that ran. Scripted: `e2e/cli/ask.test.ts`.
- `ask-mock-sql` takes SQL from `--mock-sql` instead of a model, and still validates it. Scripted: `e2e/cli/ask.test.ts`.

## How to get to it (user POV)

- Run `askdb ask --question "<text>"` in a project whose config has a schema folder (`introspection.outputDir`).
- Run `askdb ask --schema <dir> --question "<text>"` to name the schema folder.
- Add `--explain`, `--mode <schema_only|bounded_results>` or `--mock-sql "<sql>"`.

## Driving it with control-askdb

Preconditions:

- Baseline from the README. `askdb/schema.json` exists in the project, written by the [introspect](./introspect.md) recipe's `introspect-write` step.

- **Generate.** Set the reply, then ask. Run `vctl model reply "SELECT c.name, SUM(o.quantity) AS units FROM customers c JOIN orders o ON o.customer_id = c.id GROUP BY c.name ORDER BY units DESC"` and `vctl cli --label ask-generate -- ask --question "Which customers bought the most units?"`. Exit `0`; stdout is `-- sql --` then exactly that SQL.
- **Prompt reached the model.** Run `vctl model requests --label ask-generate-prompt`. The newest line's `body` contains the question text and the column name `customer_id`, which only the schema can supply (the question names `customers`, so the table name proves nothing).
- **Refuse a write.** Run `vctl model reply "DELETE FROM orders"` and `vctl cli --label ask-refuse-write -- ask --question "remove all orders"`. Exit `1`; stderr starts `SqlValidationError [SQL_NOT_SELECT_OR_WITH]: SQL must start with SELECT or WITH (got 'delete').` and has a `Hint:` line; stdout is empty.
- **Sensitive warning.** Run `vctl model reply "SELECT id, secret_recovery_token FROM users"` and `vctl cli --label ask-sensitive-warning -- ask --schema schemas/orders-users-sensitive.schema --question "recovery tokens"`. Exit `0`; stdout has the SQL; stderr has `Warning: generated SQL references sensitive columns: public.users.secret_recovery_token` and `Review carefully before sharing or running this SQL.`
- **Explain.** Run `vctl model reply "SELECT name FROM customers"` and `vctl cli --label ask-explain -- ask --question "customer names" --explain`. Exit `0`; stdout has `-- sql --`, the SQL, then `-- explain --` and JSON whose `checksVerified` lists `leading_select_or_with`.
- **Mock SQL.** Run `vctl cli --label ask-mock-sql -- ask --question "anything" --mock-sql "SELECT 1"`, then `vctl model requests --label ask-mock-sql-prompt`. Exit `0`; stdout is `-- sql --` then `SELECT 1`, and `model requests` reports the same count as before the drive. With `--mock-sql "DROP TABLE orders"` the exit is `1` with `SqlValidationError`.

## Gotchas

- The fake model returns whatever `vctl model reply` set last, for any question. Set the reply before each drive, and never present a fake-model run as evidence of a real model's SQL quality.
- `--mock-sql` and `dev.mockSql` skip the model entirely: they prove validation, not generation. Use them only for `ask-mock-sql`.
- `askdb ask` has no `--json`: assert on the `-- sql --` and `-- explain --` sections of stdout.
- The `Generating SQL…` progress line appears only on a TTY. Its absence in evidence is expected.
- Without `--schema`, `ask` reads `introspection.outputDir` (`./askdb`). Before an introspect it fails with `Schema path not found.`, which is a missing precondition, not a product failure.
