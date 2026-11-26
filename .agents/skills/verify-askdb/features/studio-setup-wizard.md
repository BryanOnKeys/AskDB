# Studio setup wizard

When Studio starts without a schema artifact, it opens the setup wizard at `/` instead of the Overview. With no `askdb.config.*` at all, the wizard first writes one from a short form; with a config but no schema folder, it only runs introspection. Either way it ends on the Overview.

## Sub-features

- `wizard-config` writes `askdb.config.ts` and `.env.example` from the `Database & model provider` form, when the project has no config. Scripted: `e2e/studio/setup-wizard.spec.ts`.
- `wizard-env` shows the `.env` lines a config the wizard just wrote needs, with a `Copy` button. An existing config gets no `.env` step. Scripted: `e2e/studio/setup-wizard.spec.ts`.
- `wizard-introspect` runs introspection from the browser and opens the Overview on the new schema; an existing config that can't load shows its load error first. Scripted: `e2e/studio/setup-wizard.spec.ts`.

## How to get to it (user POV)

- Run `askdb studio` with no `--schema`, in a project whose `introspection.outputDir` (default `./askdb`) doesn't exist, or that has no `askdb.config.*`.
- Studio prints `No schema artifact found — Studio will open with the guided setup wizard.` or `No askdb.config.* found — Studio will open with the guided setup wizard.`, then its URL.

## Driving it with control-askdb

Preconditions:

- A new run: `vctl setup --run wizard`. Don't introspect it.
- For `wizard-config` only, delete the run's config: `rm <project>/askdb.config.ts`.
- Run `vctl --run wizard studio start --no-schema`, and open `http://127.0.0.1:<port>/`.

- **No config.** The heading `Set up AskDB`, the text `No askdb.config.ts found in <project>`, and step `1 · Database & model provider`: a combobox `Database engine` (`PostgreSQL` selected), `AI provider` (`OpenAI`), the textbox `Schema artifact directory` (`./askdb`), the combobox `RAG store` (`File (default, no setup required)`), a checkbox `Enable Studio execute (run queries from the browser playground)`, and the button `Write askdb.config.ts`.
- **Write the config.** Select `SQLite` in `Database engine`. A textbox `SQLite file path` (`./data.db`) replaces the connection field; set it to `./shop.db`. Choose `Write askdb.config.ts`. The step shows `config written`, and steps `2 · Add your secrets to .env` and `3 · Introspect your database` appear. Read `<project>/askdb.config.ts`: it sets `provider: "sqlite"` with `file: "./shop.db"`, `outputDir: "./askdb"`, and `apiKey: env("OPENAI_API_KEY")`. `<project>/.env.example` exists.
- **Config, no schema.** With the config kept, the text reads `Config found at <project>/askdb.config.ts, but no schema artifact yet. Run introspection to create it.`, and the only step is `1 · Introspect your database`. The wizard can't know which variables a config it didn't write reads, so there's no `.env` step: a variable the config reads but `.env` doesn't set makes introspection fail with that variable's error.
- **Config that can't load.** Replace `<project>/askdb.config.ts` with one line, `throw new Error("broken");`, and start Studio again. An alert reads `askdb.config.ts couldn't be loaded`, then the error (`broken`), then `Fix the config, the .env it reads or a missing package, then restart Studio.` There's no `.env` step; the introspect step is still `1`, with `Run introspection` disabled and `Fix the config first: introspection reads it.` under it.
- **Introspect.** Choose `Run introspection`. Studio opens `/overview` with `TABLES` `3`, and `<project>/askdb/schema.json` exists.

## Gotchas

- Without a config, Studio can't read `studio.listen.port`, so it listens on its default, 5556, and can collide with another Studio. The harness always passes `--port` and `--host`, so a wizard run stays on its own port.
- After `Write askdb.config.ts`, the env-var fields become disabled buttons named for the variables (`OPENAI_API_KEY`, `OPENAI_MODEL`), not textboxes.
- `vctl setup --run wizard` makes `wizard` the checkout's current run. Pass `--run <id>` to go back to another run.
