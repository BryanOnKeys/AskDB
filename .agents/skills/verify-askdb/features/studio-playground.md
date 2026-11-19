# Studio Playground

Studio's Playground (`/playground`) lets a user type a question, generate SQL against the schema folder Studio opened, and, with Studio execute on, run that SQL read-only against the configured database and see the rows.

## Sub-features

- `studio-open` serves the app with its session token, and the Playground shows the heading `Query Playground`.
- `studio-generate` generates SQL for a question in `Full schema` mode and shows it under `Generated SQL`.
- `studio-execute` runs the generated SQL read-only against `shop.db` and shows its rows.
- `studio-guard` refuses an API call without the session token.

## How to get to it (user POV)

- Run `askdb studio --schema <dir>` (or `askdb enrich`) from a project with an `askdb.config.*`, then open the printed URL and choose `Playground` in the navigation.
- Go straight to `http://127.0.0.1:<port>/playground`.
- Press `⌘↵` in the question field to generate.

## Driving it with control-askdb

Preconditions:

- Baseline from the README, with `askdb/schema.json` written by the [introspect](./introspect.md) recipe.
- Run `vctl studio start askdb`. It prints `studio running: pid …, http://127.0.0.1:<port>`, and `vctl doctor` shows `ok   studio`.
- Run `vctl model reply "SELECT name, country FROM customers ORDER BY name"`.

- **Open (UI).** With the session's browser tool, open `http://127.0.0.1:<port>/playground`. A heading `Query Playground`, a textbox named `Natural language question` (placeholder `How many users placed orders last month?`), a group `Retrieval mode` with buttons `Full schema` and `RAG` (disabled, beside a `No index` badge in the header), and a button `Generate SQL ⌘↵`. The sidebar footer reads `sqlite · askdb`.
- **Generate (UI).** Type `customers by name` into that textbox and choose `Generate SQL ⌘↵`. The status `Generated SQL.` appears under the button, `History (1)` lists `customers by name` tagged `full`, and the section headed `Generated SQL` shows `SELECT name, country FROM customers ORDER BY name`. Below it, the execute bar shows `SQLite`, `file configured` and `better-sqlite3 ready`, and the button `Execute Query`. Save a screenshot and an accessibility snapshot to the evidence folder.
- **Execute (UI).** Choose `Execute Query`. The status `4 rows · <n>ms` appears beside the button, and a heading `Results` heads a table with column headers `name` and `country` and the rows `Ada UK`, `Grace US`, `Linus FI` and `Margaret US`. Save a screenshot and an accessibility snapshot.
- **Generate (API).** Run `vctl studio-request POST /api/ask '{"question":"customers by name","mode":"full"}'`. Status `200`; `sql` is the reply's SQL and `explain.checksVerified` lists `leading_select_or_with`.
- **Execute (API).** Run `vctl studio-request GET /api/execute/status`. `enabled`, `configured` and `installed` are `true`, and `provider` is `sqlite`. Then run `vctl studio-request POST /api/execute '{"sql":"SELECT name, country FROM customers ORDER BY name"}'`. Status `200`; `rows` are `["Ada","UK"]`, `["Grace","US"]`, `["Linus","FI"]`, `["Margaret","US"]`, and `rowCount` is `4`.
- **Guard.** Run `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:<port>/api/workspace`. Prints `403`: a call without `x-askdb-studio-token` is refused.

## Gotchas

- The `Generate SQL` button's accessible name includes its shortcut (`Generate SQL ⌘↵`), and its title is `Generate SQL (⌘↵)`. Match the name by prefix.
- `Execute Query` appears only after SQL is generated, and stays disabled until execute is configured and its driver installed (the badges beside it say which). A missing or disabled button means a missing precondition, so check `GET /api/execute/status`.
- At a 1280×800 viewport the `Results` table sits below the fold, under `Get the code`. Scroll before the screenshot, or prove the rows from the accessibility snapshot.
- Which `Retrieval mode` button is selected shows only in styling: the buttons carry no pressed state. Read it from the screenshot, or from the History tag (`full` or `rag`) after a generate.
- The API recipe (`vctl studio-request`) calls the endpoints the page calls, with the page's token and Origin. It proves the server, not the UI: a UI change needs the UI steps.
- Studio writes `playground-history.json` and other files into the schema folder it opened. Open only the run's own folders (`askdb`, `schemas/…`), never `fixtures/`.
- `askdb studio --port 0` is refused (`Invalid --port: 0`). The harness picks a free port per run.
- Without a config in its working directory, Studio opens the setup wizard even when `--schema` is passed. Start it through the harness, which runs it in the project.
