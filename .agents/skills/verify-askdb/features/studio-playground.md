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

- **Open (UI).** With the session's browser tool, open `http://127.0.0.1:<port>/playground`. A heading `Query Playground`, a textbox under the label `Natural language question` (placeholder `How many users placed orders last month?`), and a `Retrieval mode` group with `Full schema` selected.
- **Generate (UI).** Type `customers by name` into that textbox and choose the button whose name starts `Generate SQL`. A status `Generated SQL.` appears, and the section headed `Generated SQL` shows `SELECT name, country FROM customers ORDER BY name`. Save a screenshot and an accessibility snapshot to the evidence folder.
- **Execute (UI).** Choose `Execute Query`. A result table shows the rows `Ada UK`, `Grace US`, `Linus FI` and `Margaret US`. Save a screenshot.
- **Generate (API).** Run `vctl studio-request POST /api/ask '{"question":"customers by name","mode":"full"}'`. Status `200`; `sql` is the reply's SQL and `explain.checksVerified` lists `leading_select_or_with`.
- **Execute (API).** Run `vctl studio-request GET /api/execute/status`. `enabled`, `configured` and `installed` are `true`, and `provider` is `sqlite`. Then run `vctl studio-request POST /api/execute '{"sql":"SELECT name, country FROM customers ORDER BY name"}'`. Status `200`; `rows` are `["Ada","UK"]`, `["Grace","US"]`, `["Linus","FI"]`, `["Margaret","US"]`, and `rowCount` is `4`.
- **Guard.** Run `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:<port>/api/workspace`. Prints `403`: a call without `x-askdb-studio-token` is refused.

## Gotchas

- The `Generate SQL` button's accessible name includes its shortcut (`Generate SQL ⌘↵`), and its title is `Generate SQL (⌘↵)`. Match the name by prefix.
- `Execute Query` is disabled until SQL has been generated and execute is configured and its driver installed. A disabled button means a missing precondition, so check `GET /api/execute/status`.
- The API recipe (`vctl studio-request`) calls the endpoints the page calls, with the page's token and Origin. It proves the server, not the UI: a UI change needs the UI steps.
- The UI steps' handles come from `apps/studio/src/web/views/playground/PlaygroundPage.tsx` and haven't yet been driven in a browser by this skill. The first run that drives them confirms them or fixes this file.
- Studio writes `playground-history.json` and other files into the schema folder it opened. Open only the run's own folders (`askdb`, `schemas/…`), never `fixtures/`.
- `askdb studio --port 0` is refused (`Invalid --port: 0`). The harness picks a free port per run.
- Without a config in its working directory, Studio opens the setup wizard even when `--schema` is passed. Start it through the harness, which runs it in the project.
