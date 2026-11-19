# Initialize a project

`askdb init` writes a starter `askdb.config.ts` and a `.env.example` beside it, for the database, AI provider, RAG store and Studio execute the user picks. It runs interactively on a TTY, or with `--yes` from flags and defaults, then prints next steps.

## Sub-features

- `init-write` writes the config and `.env.example` for the chosen database. Scripted: `e2e/cli/init.test.ts`.
- `init-next-steps` prints `Wrote:` with both paths and a `Next steps:` list. Scripted: `e2e/cli/init.test.ts`.
- `init-refuse-overwrite` refuses an existing config unless `--force` is passed. Scripted: `e2e/cli/init.test.ts`.

## How to get to it (user POV)

- Run `askdb init` in a project folder and answer the prompts.
- Run `askdb init --yes` with flags: `--database <postgres|mysql|sqlite|sqlserver|prisma>`, `--sqlite-file <path>`, `--ai-provider <id>`, `--rag-store <file|memory|pgvector>`, `--studio-execute` or `--no-studio-execute`, `--path <file>`, `--force`, `--skip-install`.

## Driving it with control-askdb

Preconditions:

- Baseline from the README. Create `init-check/` in the project (`mkdir <project>/init-check`), so init writes beside the run's own config instead of over it.

- **Write.** Run `vctl cli --label init-write -- init --yes --path init-check/askdb.config.ts --database sqlite --sqlite-file ./shop.db --skip-install --no-studio-execute`. Exit `0`; stdout lists `Wrote:` with `init-check/askdb.config.ts` and `init-check/.env.example`, then `Next steps:`.
- **Second view.** Read `<project>/init-check/askdb.config.ts`. It imports `defineConfig` from `@askdb/config`, sets `introspection.provider: "sqlite"` with `file: "./shop.db"`, and reads the AI key with `env("OPENAI_API_KEY")`.
- **Refuse overwrite.** Run the same command again with label `init-refuse-overwrite`. Exit `1`; stderr ends ``Use `askdb init --force` to overwrite.``, and the file is unchanged. Then add `--force`: exit `0`.

## Gotchas

- Without `--path`, init writes `askdb.config.ts` in the working directory, which is the run's own config. Always pass `--path` into a subfolder.
- Leave `--skip-install` on: without it init installs packages into the project, which a verification run doesn't need.
- Without a TTY, init needs `--yes`, or it runs the non-interactive defaults. Pass `--yes` explicitly so the run is repeatable.
