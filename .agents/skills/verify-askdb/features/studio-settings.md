# Studio Settings

Studio's Settings screen (`/settings`) is read-only: it shows the workspace (schema ID and path, AI provider and model), the RAG store (embedder, store, which index files exist) and the schema's warnings.

## Sub-features

- `settings-workspace` shows the schema ID `askdb`, its path, AI provider `openai`, model `gpt-4o-mini` and `AI suggestions` `Configured`. Scripted: `e2e/studio/settings.spec.ts`.
- `settings-rag-store` shows the embedder `mock (local lexical)`, store `file`, and whether the lock file and embeddings files are present. Scripted: `e2e/studio/settings.spec.ts`.
- `settings-warnings` lists the schema's warnings as JSON objects, such as `missing_table_md`. Scripted: `e2e/studio/settings.spec.ts`.

## How to get to it (user POV)

- Choose `Settings` at the bottom of Studio's navigation, or open `/settings`.

## Driving it with control-askdb

Preconditions:

- Baseline from the README, with `askdb/schema.json` written by the [introspect](./introspect.md) recipe.
- Run `vctl studio start askdb`, and open `http://127.0.0.1:<port>/settings`.

- **Workspace.** The heading `Settings`, then under `Workspace`: `Schema ID` `askdb`, `Schema path` ending `/project/askdb`, `AI provider` `openai`, `Model` `gpt-4o-mini`, `AI suggestions` `Configured`.
- **RAG store.** Under `RAG Store`: `Embedder` `mock (local lexical)`, `Store` `file`. Before an index is built, `Lock file`, `Embeddings JSON` and `Embeddings binary` read `missing`; after one, `present`.
- **Warnings.** Under `Schema Warnings`, a freshly introspected shop schema lists `{"kind": "missing_table_md", "tableId": "table:public.customers"}` and the same for `orders` and `products`. After a table is saved from its Enrichment tab with no column text, that table's entries become `missing_column_md` for each column.

## Gotchas

- Settings shows the config Studio loaded at start. Change `askdb.config.ts`, then restart Studio (`vctl studio stop`, then `start`) before you read it again.
- Nothing on this screen changes state, so its proof is the page text alone.
