---
name: verify-askdb
description: "Launch and drive AskDB the way a user does: the `askdb` CLI, the HTTP API and Studio, built from this checkout, in a disposable project with a fake or live model, capturing evidence. Use to run, start or screenshot AskDB, to prove a user-facing change works in the real app (not just tests), or to reproduce a reported CLI, API or Studio behavior."
---

# Verify AskDB

AskDB's user surfaces are the `askdb` CLI (`apps/cli`), the HTTP API (`apps/http-api`) and Studio (`apps/studio`, a browser UI). The library itself (`ask()` in `@askdb/core`) has no surface of its own: drive it through these, or through the [consumer lab](../consumer-lab/SKILL.md), which installs AskDB the way an outside project does and runs a matrix over four engines.

Every drive goes through the harness `control-askdb.mjs` in this folder. Each run gets its own project folder, outside the repo:

- **Config:** an `askdb.config.ts` pointing at the run's own ports.
- **Database:** the Quickstart's `shop.db` (`examples/quickstart-shop/shop.sql`).
- **Schemas:** copies of `fixtures/schemas/{orders-users-sensitive,agency-multi-tenant}.schema`.
- **Model:** a fake OpenAI endpoint (`fake-openai.mjs`) that answers with the SQL you set and records every prompt.

Two runs never share a port, project or model, so runs from other worktrees are safe beside yours. Run every command from the repo root. Below, `vctl` stands for `node .agents/skills/verify-askdb/control-askdb.mjs`.

## Launch

```bash
pnpm exec turbo run build --filter=askdb --filter=@askdb/http-api --filter=@askdb/studio   # once per code change
vctl setup            # or: vctl setup --live   (real OpenAI: OPENAI_API_KEY in env or the repo's .env)
```

`setup` refuses to start if a build is missing. It is ready when it prints `run <id> ready`, and every later `vctl` command from this checkout uses that run (pass `--run <id>` to pick another). The CLI is short-lived: each `vctl cli` call is one fresh process in the project. The two servers are long-lived, each on the run's own port:

```bash
vctl api start [schema-dir]      # ready: "AskDB HTTP API listening on"; default schema: schemas/orders-users-sensitive.schema
vctl studio start [schema-dir]   # ready: "AskDB Studio is running at"; same default
vctl api stop / vctl studio stop
```

Studio writes into its schema folder (`tables/*.md`, `concepts.md`, `playground-history.json`), which is why the run uses copies. Never point a drive at `fixtures/` or the repo root's config.

## Doctor

```bash
vctl doctor
```

Read-only. Exits 1 on any `FAIL`. It checks:

- the CLI's `--version` matches `apps/cli/package.json`;
- every `dist` is newer than its `src` (`FAIL dist current` means rebuild);
- the project exists;
- the fake model answers for this run, and each server the run started is still the process it started and answers on its port.

Run it before the first drive, after any drive that surprised you, and before you report a failure. When the doctor passes but Studio's UI looks wedged, `vctl studio stop` and start it again instead of driving on.

## Drive

```bash
vctl model reply "SELECT name FROM customers"        # what the fake model answers from now on; bare SQL is fenced for you
vctl cli --label <name> -- <askdb args>              # e.g. -- ask --question "…"; prints stdout/stderr, exits with askdb's code
vctl model requests --label <name>                   # saves the prompts the model received
vctl api-request <METHOD> <path> ['<json>']          # the HTTP API
vctl studio-request <METHOD> <path> ['<json>']       # Studio's API, with its session token, Origin and JSON type
```

The feature map in [`features/`](features/README.md) is the source of truth for what to drive: start at its README, then use the feature's file as the recipe. A proof covers every entry point the feature file lists, not just the convenient one.

For Studio's UI, use whichever browser tool the session has (the T3 preview tools, Claude in Chrome, the in-app browser) on `http://127.0.0.1:<studio port>` (`vctl studio start` prints it). Target handles by role and accessible name, as `features/studio-playground.md` lists them. Studio's page carries its API token, so the UI needs no setup.

## Evidence

Each `cli`, `model requests`, `api-request` and `studio-request` writes one numbered file to the run's evidence folder, which `setup` prints: `<os tmpdir>/askdb-verify/<run>/evidence/NN-<label>.json`. Set `ASKDB_VERIFY_ROOT` to move the root. A CLI record holds the command, cwd, exit code, stdout and stderr. An HTTP record holds the request, status and response. Save browser screenshots and accessibility snapshots into the same folder.

Proof standards:

- **The real path:** drive what a user runs. `--mock-sql` and `dev.mockSql` skip prompt building and the provider, so they prove only validation. Prove generation through the fake model, and use `--mock-sql` only where the feature file says it is the path under test.
- **Action and result:** capture the command and its outcome, and a second view of any state it changed: the files `introspect` wrote, the rows `execute` returned, the prompt the model received.
- **The model is a stand-in:** the fake model returns the SQL you set, so a fake-model run proves AskDB's handling of a reply, never the quality of a real model's SQL. Say which model you used. Use `--live` only when a real model's behavior is the question, and name the model.
- **Skips stay skips:** report an entry point you couldn't reach with the command you tried and the precondition that was missing. Never count it as verified through another path.

## Cleanup

```bash
vctl cleanup
```

Stops only the processes this run started: each is matched by PID and command line, never by name. It then deletes the run's project and copies the server logs and model prompts into the evidence folder as `zz-*`. The evidence folder stays: check it still lists your files before you report. Run cleanup after every failed attempt too, so nothing outlives the run.

## Helpers

| File | What it is |
|---|---|
| `control-askdb.mjs` | The harness above. `vctl help` lists its commands. Node built-ins only. |
| `fake-openai.mjs` | The stand-in model: OpenAI Responses and Chat Completions, replying with `<run>/model-reply.txt` and logging to `<run>/model-requests.jsonl`. `setup` starts it; run it by hand (`node fake-openai.mjs <run-dir> <port>`) only to debug it. |

Verification scaffolding: `setup` symlinks `packages/config` and `better-sqlite3` into the project's `node_modules`, standing in for what an installed project resolves. `cleanup` deletes it with the project.

Keep the map current with pstack's `maintain-verification-skill`, when it's installed.
