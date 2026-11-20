# ADR 0036: Model base URLs with credentials are refused

**Status:** accepted · 2026-11-06

## Decision

AskDB refuses a model base URL that holds a user name or a password. It refuses the URL where it reads it, with an error that names the setting. No message repeats the URL or a part of it.

| Where AskDB reads the URL | The error names |
|---|---|
| Config load in `@askdb/config`: `ai.providerConfig.<provider>.baseUrl`, on every connection | The config key and the file |
| `@askdb/ai`, from an env map | The env variable |
| `@askdb/ai`, from a typed config section | `connection.baseUrl` |
| `@askdb/ai`, when a built-in provider builds a model from an `AiConfig` | `baseURL` |
| The variable a provider SDK reads itself (`OPENAI_BASE_URL`, `ANTHROPIC_BASE_URL`), when AskDB passes no base URL | That variable |

A URL counts when it parses with a user name or a password. A URL that does not parse counts when it holds an `@`. An `@` in the path does not count.

To check the SDK's own variable, `@askdb/ai` reads that one variable from `process.env`, and only when the config gives no base URL. It never uses the value. This is the one exception to ADR 0005's rule that only `@askdb/config` reads `process.env`.

## Why

- Such a URL never worked: `fetch` refuses it. The error from `fetch` quotes the whole URL, and AskDB copied that text into its error and its log.
- A mask copies everything it does not recognise as a secret, so a spelling it does not know leaks (ADR 0011).

## Options

| | Option | Why it lost |
|---|---|---|
| A | Refuse the URL where AskDB reads it, and name the setting | **Chosen.** |
| B | Mask the credentials out of the failure text in core | A spelling the mask does not know leaks, and AskDB keeps sending a URL that cannot work. |
| C | A config field for request headers, so a proxy's credentials have a supported home | No built-in provider connection takes headers today, and a host can set headers on a model it builds in code. |

## Keep

| Rule | Checked by |
|---|---|
| No error message repeats the URL or a part of it. | `packages/ai/src/base-url.test.ts`, `packages/config/src/config.test.ts` |
| Every built-in provider refuses the URL when it builds a model. A new provider builds its SDK options through `baseURLOption()`. | `packages/ai/src/base-url.test.ts` |
| Config load refuses the URL on every connection of a provider, a named connection included. | `packages/config/src/config.test.ts` |
| `@askdb/config` and `@askdb/ai` each hold a copy of the rule, and both refuse the same URLs. | `packages/client/src/provider-config-drift.test.ts` |
| A client refuses the URL before it makes a request, and logs nothing. | `packages/client/src/client.test.ts` |
| `@askdb/ai` reads only the SDK's own base URL variable from `process.env`, and only when the config gives no base URL. | review |
| The template of the new-ai-adapter skill calls `baseURLOption()`. | review |

Each message tells the host to put the key in the provider's API key setting. Other credentials go in headers on a model that the host builds in code.
