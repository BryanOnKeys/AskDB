# installable-smoke

End-to-end install smoke test for the published AskDB packages. Confirms a downstream consumer can `npm install` local package tarballs, get types resolving correctly, run the SQL-generation-only `ask()` pipeline, load `@askdb/introspect`, use `@askdb/enrich`, and wire `@askdb/rag` without a workspace.

This is the executable form of Phase 4 Group 4 (`docs/specs/phase-4-publish-npm/plan.md`).

## What it proves

1. **`@askdb/core` is installable** — `npm install <tarball>` succeeds without the workspace.
2. **No `pg` is required** — the consumer never installs the optional `pg` peer; importing `@askdb/core` and generating SQL works.
3. **`@askdb/introspect` is installable** — public exports resolve from the packed tarball.
4. **`@askdb/prisma` is installable** — the schema-file connector resolves without a database connection.
5. **`@askdb/enrich` is installable** — public workspace helper exports resolve from the packed tarball.
6. **`@askdb/rag` is installable** — public exports and the `@askdb/rag/stores/memory` subpath resolve, an in-memory index builds, and `ask({ retriever })` completes. The removed `createOpenAiEmbedder` export and `@askdb/rag/embedders/openai` subpath stay gone.
7. **Catalog runner type resolves** — `@askdb/introspect` exposes `CatalogQueryRunner` for connector-owned catalog reads.
8. **Package bins are packaged** — `askdb` (including `askdb rag`) and `askdb-studio` run from `node_modules/.bin`, and `@askdb/rag` installs no `askdb-rag` bin.
9. **`ai` is a host-owned peer** — the consumers declare `ai` themselves. A separate `consumer-ai6/` fixture installs `@askdb/core` + `@askdb/rag` next to the AI SDK 6 floor, pinned exactly (`ai@6.0.0`; `@ai-sdk/openai@3.0.0` is the fixture's own direct dependency, since it imports the package itself; no `--legacy-peer-deps`), asserts core did not nest its own `ai` and that `@askdb/config` isn't installed (`@askdb/rag` doesn't depend on it), type-checks an AI SDK 6 provider model against `AskDbLanguageModel` with `skipLibCheck: false` (so a core or rag declaration that needs an AI SDK 7 type fails here instead of silently becoming `any`; `@types/json-schema` is there because `ai@6.0.0`'s `@ai-sdk/provider` declarations import it without depending on it), and runs `ask()` and the RAG AI SDK embedder through AI SDK 6 with mock models — including that the NL→SQL system prompt reaches the model.
10. **Optional peers stay optional in a bundle** — esbuild bundles `@askdb/client` and the engine packages with no other `@ai-sdk/*` package and no database driver installed; a missing provider SDK and each missing driver (`pg`, `mysql2`, `better-sqlite3`, `mssql`) fail at runtime with their install hint. This guards the `.catch()` chained on each optional `import()`.
11. **The apps load under Yarn Plug'n'Play** — Plug'n'Play gives a package its peer only through the package that depends on it, so a package that depends on `ai` or an `@ai-sdk/*` package must provide `zod`, and one that depends on `@askdb/core` must pass `ai` through (#748). `yarn-pnp.sh` first checks every packed manifest for both rules, which covers packages the commands never load, such as `@askdb/prisma`. It then installs only `askdb` and `@askdb/http-api` (every AskDB package from its tarball, through `resolutions`) into a Yarn 4 project with `nodeLinker: pnp` and `pnpFallbackMode: none`, as `yarn dlx askdb` does but without the fallback to the project's own dependencies. `askdb --version`, `--help`, `introspect templates`, `studio --help`, `rag --help` and `askdb-http --help` must load and exit 0.

12. **The Quickstart example runs as the page says** — `quickstart-example.sh` copies `examples/quickstart-shop` and installs it with pnpm, every AskDB package pinned to its tarball through pnpm overrides (as the consumer lab does). It makes `shop.db`, runs `askdb init`, `askdb introspect` and `askdb ask --mock-sql` with step 5's question and SQL from the Quickstart page, pipes the SQL into `run-query.mjs`, and compares the rows with the page's step 6 table (#940). `askdb init` runs with `--skip-install`, and the script adds `@askdb/config` from its tarball and `better-sqlite3` itself: init installs `@askdb/config` at its own version from the registry, which doesn't have a version before it's released. `apps/cli/src/quickstart-example.test.ts` checks the example's files against the page's code blocks.
13. **The chart example draws its recorded chart** — `chart-example.sh` copies `examples/chart-a-result` and installs it with pnpm, every AskDB package pinned to its tarball through pnpm overrides. It runs the example's own tests (`node --test`) and `draw-recorded.mjs`. No test calls a model: they draw the recorded chart plan with ECharts, render the shadcn/ui version (`shadcn/components/spec-chart.tsx`) with React into happy-dom, check the packed `@askdb/client/charts` against the recorded run (the classification, the prompt, the checks and the fallback), and run the tutorial's script, `first-chart.mjs`, against a local stand-in for the model provider that answers with the recorded SQL and plan. `apps/docs-site/scripts/check-chart-example.test.mjs` checks the example's files against the code blocks of the tutorial and the guide.

The test fails clearly if any of these regress: `private: true` slips back, `dist/` loses files, types break, or package surfaces stop resolving.

## Run

From the repo root:

```bash
pnpm smoke:install
```

Or directly:

```bash
bash examples/installable-smoke/run.sh
```

The script works in a fresh `mktemp -d` directory, so the repo stays clean (no consumer `node_modules`, no tarballs committed).

## Layout

- `consumer/` — the consumer fixture (`package.json`, `tsconfig.json`, `src/smoke.ts`).
- `consumer-cjs/` — CommonJS `require()` consumer of `@askdb/config`, `@askdb/core` and the `@askdb/introspect/kit` subpath.
- `consumer-bundle/` — an esbuild-bundled host of `@askdb/client` and the four engine packages (`@askdb/postgres`, `@askdb/mysql`, `@askdb/sqlite`, `@askdb/sqlserver`) with only `@ai-sdk/openai` installed and no database driver.
- `consumer-ai6/` — AI SDK 6 host pinned at AskDB's AI SDK 6 floor (`ai@6.0.0`; `@ai-sdk/openai@3.0.0` is the fixture's own direct dependency) consuming `@askdb/core` and `@askdb/rag`. A floor rise moves the `ai` pin (ADR 0015).
- `quickstart-example.sh` — the Quickstart example check; it takes the tarball directory and a work directory.
- `chart-example.sh` — the chart example check; it takes the tarball directory and a work directory.
- `yarn-pnp.sh` — the Yarn 4 Plug'n'Play check, run last by `run.sh`; it takes the tarball directory and a work directory, and runs Yarn from a pinned `@yarnpkg/cli-dist` release, not Corepack.
- `run.sh` — orchestrator: builds the workspace, packs packages, installs `@askdb/core`, `@askdb/introspect`, `@askdb/postgres`, `@askdb/prisma`, `@askdb/enrich`, and `@askdb/rag` into a copy of the consumer fixture, typechecks, runs the smoke script, and checks package bins.
