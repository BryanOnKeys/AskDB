# Studio Overview

Studio's Overview (`/overview`) is the landing screen for a schema folder: counts of tables and concepts, the RAG index's health, sensitivity coverage, the tables still to enrich, recent Playground questions, the tenancy state and suggested next actions, with shortcuts into each.

## Sub-features

- `overview-cards` shows `TABLES`, `CONCEPTS`, `INDEX HEALTH` and `SENSITIVITY COVERAGE` for the schema; `enriched`, `partial` and `tables to go` follow the same rule as the pending list and the Tables list's filters. Scripted: `e2e/studio/overview.spec.ts`.
- `overview-pending` lists the tables still to enrich, and each row's `Enrich` link (or a click on the row) opens that table's Enrichment tab. Scripted: `e2e/studio/overview.spec.ts`.
- `overview-shortcuts` sends `Enrich tables` to the first table's Enrichment tab and `Draft tenant policy` to Tenancy. Scripted: `e2e/studio/overview.spec.ts`.
- `overview-history` lists the saved Playground history under `Recent playground queries` as soon as the page loads, and the Playground shows it under `History`. Scripted: `e2e/studio/overview.spec.ts`.
- `overview-next-actions` lists only the actions that fit the state: `Build RAG index…` until an index exists, `Rebuild index…` only once an existing index is stale. Scripted: `e2e/studio/overview.spec.ts`.
- `overview-reflects-state` updates the cards after concepts, an index or a tenant policy are added. Agent-driven.
- `overview-resync` re-reads the database into `schema.json` with `Resync schema`, says how many tables it re-read, and keeps unsaved table edits. Scripted: `e2e/studio/overview.spec.ts`.

## How to get to it (user POV)

- Open Studio's URL: `/` redirects to `/overview` when a schema folder exists. Or choose `Overview` in the navigation.

## Driving it with control-askdb

Preconditions:

- Baseline from the README, with `askdb/schema.json` written by the [introspect](./introspect.md) recipe and nothing enriched, no concepts, no index and no tenant policy.
- Run `vctl studio start askdb`, and open `http://127.0.0.1:<port>/overview`.

- **Cards.** The heading `Overview` (level 1) with the subtitle `sqlite · askdb`, buttons `Resync schema` and `Enrich tables`, then `TABLES` `3` (`0 enriched · 0 partial`), `CONCEPTS` `0`, `INDEX HEALTH` `None` (`15 chunks · 64d`) and `SENSITIVITY COVERAGE` `0%`.
- **Pending enrichment.** The section headed `Pending enrichment` reads `3 tables to go`, and its table lists `public.customers` (3 columns), `public.orders` (5) and `public.products` (4), each `none`. Choose the `public.customers` row: Studio opens `/tables/public/customers/enrichment`. Each row also has a link `Enrich <schema>.<table>`: focus `Enrich public.orders` and press Enter, and Studio opens `/tables/public/orders/enrichment`.
- **Other sections.** `Recent playground queries` shows `No queries yet`; `RAG index` shows `Chunks` `15`, `Indexed` `0`, `Model` `Mock lexical`, `Updated: never`; `Tenancy` shows `Not configured` and a button `Draft tenant policy`; `Suggested next actions` lists `Add description to customers` and `Build RAG index for retrieval-augmented queries`.
- **History.** Stop Studio, write `askdb/playground-history.json` with one entry (an array of `{ id, timestamp, question, mode, sqlMode, sql }`), and start it again. `Recent playground queries` lists the question (`last 1 queries`) when the page loads, and the Playground shows `History (1)` with the question, before any ask.
- **Enrichment levels.** A table is `enriched` once it and every column have a description, `partial` once anything is written for it or a column. Stop Studio, write `askdb/tables/customers.md` with an alias and all three column descriptions but no table description, and start it again: `TABLES` reads `0 enriched · 1 partial`, `Pending enrichment` still reads `3 tables to go`, and `public.customers` is listed as `partial`; the Tables list shows `Complete 0`, `Partial 1` and `Not started 2`.
- **Next actions.** With no index, `Suggested next actions` lists `Build RAG index for retrieval-augmented queries` and no `Rebuild index`. Build the index on the RAG Index screen: neither line shows. Untrack a table (Tables › Sensitivity › `Status`) and save: `Rebuild index — tables changed since last build` appears.
- **Shortcuts.** Choose `Enrich tables`: Studio opens `/tables`, which lands on `/tables/public/customers/enrichment`. Go back and choose `Draft tenant policy`: Studio opens `/tenancy`.
- **Resync.** Choose `Resync schema`. Studio sends `POST /api/introspect` (status 200), shows `Re-introspected 3 tables from sqlite — enrichment preserved.` above the cards, and still shows `3 tables to go`; `<project>/askdb/schema.json` has a newer modification time, and `tables/*.md` files are untouched. An unsaved edit on a table (Tables, change `Tags`, then back to `Overview` through the navigation) is still there, with `Unsaved changes`, after the resync.
- **Reflects state.** After the [concepts](./studio-concepts.md), [RAG index](./studio-rag-index.md) and [tenancy](./studio-tenancy.md) recipes, the cards read `CONCEPTS` `1` (`1 defined`), `INDEX HEALTH` `Stale` when the index was built before the policy, and `Tenancy` `Configured`.

## Gotchas

- Resync rewrites the `schema.json` of the folder Studio opened from the config's database. On a fixture folder (`schemas/…`) that replaces its tables with the shop's: resync only `askdb`.
