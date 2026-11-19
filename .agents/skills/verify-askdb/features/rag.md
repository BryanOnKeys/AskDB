# Schema retrieval (RAG)

`askdb rag` (experimental) indexes a schema folder into chunks for retrieval and queries the index with a question, returning the most relevant tables and columns with scores. With the mock embedder it needs no AI provider.

## Sub-features

- `rag-index` indexes a schema folder and prints JSON stats.
- `rag-reindex` reuses unchanged chunks on a second index.
- `rag-query` returns the top `k` chunks for a question, the matching column first.

## How to get to it (user POV)

- Run `askdb rag index [schema-dir]`, then `askdb rag query [schema-dir] --question "<text>" [-k N]`.
- Add `--embedder <mock|ai>` and `--store <file|memory|pgvector>`, or take both from `rag` in the config.

## Driving it with control-askdb

Preconditions:

- Baseline from the README (`rag.embedder: "mock"`, `rag.store: "file"`), with `askdb/schema.json` written by the [introspect](./introspect.md) recipe.

- **Index.** Run `vctl cli --label rag-index -- rag index askdb`. Exit `0`; stdout is JSON with `chunksTotal` `15` and `chunksIndexed` `15`.
- **Second view.** List `<project>/askdb`. It now holds `schema.embeddings.bin`, `schema.embeddings.json` and `schema.lock.json` beside `schema.json`.
- **Reindex.** Run `vctl cli --label rag-reindex -- rag index askdb` again. Exit `0`; `chunksReused` is `15` and `chunksIndexed` is `0`.
- **Query.** Run `vctl cli --label rag-query -- rag query askdb --question "customer country" -k 3`. Exit `0`; stdout JSON has three `results`, the first with `id` `chunk:askdb:table:public.customers#country`.

## Gotchas

- The file store writes into the schema folder. Index only the run's own folders.
- The mock embedder is lexical and deterministic: scores prove indexing and querying, not embedding quality. Use `--embedder ai` with a live run for that.
- `--api-key` was removed. Keys come from the config's provider connection.
