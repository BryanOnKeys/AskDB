# ADR 0001: Logs are Pino JSON, made by a factory in core

**Status:** accepted · 2026-05-06

## Decision

AskDB writes structured logs with Pino. One factory in `@askdb/core`, `createAskDbLogger()`, builds every logger. The CLI and the HTTP API call it and build no Pino logger of their own.

Each log line is one JSON object, and each line carries a `correlationId`. The host chooses the destinations: stderr, stdout, a file, or several of them in one run.

The CLI writes its result to stdout and its logs to stderr by default.

## Why

- Tests, CI and log aggregators parse one JSON object per line.
- A host must send logs to more than one destination without shell redirection.
- One factory keeps the field names the same in every app that wraps core.

## Options

| | Option | Why it lost |
|---|---|---|
| A | Pino, behind one factory in core | **Chosen.** |
| B | Winston | It is heavier and slower on hot paths, and its JSON output is less uniform than one object per line. |
| C | Roarr | Its ecosystem for several destinations and for CLI use is smaller. |
| D | consola | It is built for console output, not for strict JSON lines, and several destinations need custom code. |
| E | `console` and hand-made JSON | Levels, child loggers and destinations all become custom code. |

## Keep

| Rule | Checked by |
|---|---|
| Every log line is one JSON object with an `event` and a `correlationId`. | `packages/core/src/logging/create-askdb-logger.test.ts`, `apps/cli/src/spawn-logs.test.ts` |
| The CLI's result goes to stdout and its logs go to stderr. Logs reach stdout only when the user asks for them there. | `apps/cli/src/spawn-logs.test.ts` |
| Only core's factory builds a Pino logger. | review |
| A pretty-printer such as `pino-pretty` is for development only. No shipped path needs one. | review |

The log fields and events are in `docs/specs/modes-and-observability.md`.
