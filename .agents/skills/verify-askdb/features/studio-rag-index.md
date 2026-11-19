# Studio RAG Index

Studio's RAG Index screen (`/rag-index`) shows the retrieval index for the schema folder (chunks, what is indexed, whether it is fresh), builds it, and has a query debugger that shows which chunks a question retrieves.

## Sub-features

- `rag-ui-status` shows the chunk count, `No index` and `Stale` before a build, with the embedder `Mock lexical` and `Store: file`. Scripted: `e2e/studio/rag-index.spec.ts`.
- `rag-ui-build` builds the index and reports `Indexed <n> chunks, reused 0.`, then `Index present` and `Fresh`. Scripted: `e2e/studio/rag-index.spec.ts`.
- `rag-ui-query` retrieves the matching chunks for a question, best first, with scores. Scripted: `e2e/studio/rag-index.spec.ts`.
- `rag-ui-unlocks-playground` enables the Playground's `RAG` retrieval mode once an index exists. Agent-driven.

## How to get to it (user POV)

- Choose `RAG Index` in Studio's navigation, or open `/rag-index`.
- Choose `Build Index`, then type a question and choose `Query RAG`.

## Driving it with control-askdb

Preconditions:

- Baseline from the README, with `askdb/schema.json` written by the [introspect](./introspect.md) recipe and no index built yet.
- Run `vctl studio start askdb`, and open `http://127.0.0.1:<port>/rag-index`.

- **Status.** The heading `RAG Index`, buttons `Refresh` and `Build Index`, `CHUNKS` `15` and `INDEXED` `0`, and under `Index Details`: `No index`, `Stale`, `Mock lexical`, `Updated: never`, `Store: file`. `Query RAG` is disabled.
- **Build.** Choose `Build Index`. The status `Indexed 15 chunks, reused 0.` appears, `INDEXED` reads `15`, and `Index Details` shows `Index present` and `Fresh`. List `<project>/askdb`: `schema.embeddings.json`, `schema.embeddings.bin` and `schema.lock.json` are there.
- **Query.** Type `customer country` into the textbox `Question` and choose `Query RAG`. Under `Retrieved Chunks`, the first is `chunk:askdb:table:public.customers#country` (type `column`, score `0.333`), then `chunk:askdb:table:public.customers` (`0.129`).
- **Playground unlocked.** Open `/playground`: the `RAG` button in `Retrieval mode` is enabled, and the header badge no longer reads `No index`.

## Gotchas

- The chunk count includes concepts and the tenant policy: each adds a chunk. A schema with a concept indexes 16, with a concept and a policy 17.
- Saving anything in Studio (an enrichment, a concept, a policy) can leave the index `Stale`. Build it again before you assert `Fresh`.
- The checkboxes under `CHUNK TYPES` are named only `table`, `column`, `cql`, `question`, `concept`, `relationship` and `tenant-policy`. Scope them to the query debugger when other controls share those words.
- The `tenant-policy` checkbox has no effect: the server drops that type, so with only it checked every chunk type comes back.
- `SENSITIVE INCLUDED` is always `0` in Studio, which never asks for sensitive chunks.
- An index built by `askdb rag index` shows as `Stale` here: the CLI's mock embedder is `mock:lexical-<n>`, Studio's `studio:mock-lexical-64`.
- The mock embedder is lexical: scores prove indexing and querying, not embedding quality.
