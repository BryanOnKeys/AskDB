# Studio Overview

Studio's Overview (`/overview`) is the landing screen for a schema folder: counts of tables and concepts, the RAG index's health, sensitivity coverage, the tables still to enrich, recent Playground questions, the tenancy state and suggested next actions, with shortcuts into each.

## Sub-features

- `overview-cards` shows `TABLES`, `CONCEPTS`, `INDEX HEALTH` and `SENSITIVITY COVERAGE` for the schema. Scripted: `e2e/studio/overview.spec.ts`.
- `overview-pending` lists the tables still to enrich, and choosing a row opens that table's Enrichment tab. Scripted: `e2e/studio/overview.spec.ts`.
- `overview-shortcuts` sends `Enrich tables` to the first table's Enrichment tab and `Draft tenant policy` to Tenancy. Scripted: `e2e/studio/overview.spec.ts`.
- `overview-reflects-state` updates the cards after concepts, an index or a tenant policy are added. Agent-driven.
- `overview-resync` re-reads the database into `schema.json` with `Resync schema`. Scripted: `e2e/studio/overview.spec.ts`.

## How to get to it (user POV)

- Open Studio's URL: `/` redirects to `/overview` when a schema folder exists. Or choose `Overview` in the navigation.

## Driving it with control-askdb

Preconditions:

- Baseline from the README, with `askdb/schema.json` written by the [introspect](./introspect.md) recipe and nothing enriched, no concepts, no index and no tenant policy.
- Run `vctl studio start askdb`, and open `http://127.0.0.1:<port>/overview`.

- **Cards.** The heading `Overview` (level 1) with the subtitle `sqlite · askdb`, buttons `Resync schema` and `Enrich tables`, then `TABLES` `3` (`0 enriched · 0 partial`), `CONCEPTS` `0`, `INDEX HEALTH` `None` (`15 chunks · 64d`) and `SENSITIVITY COVERAGE` `0%`.
- **Pending enrichment.** The section headed `Pending enrichment` reads `3 tables to go`, and its table lists `public.customers` (3 columns), `public.orders` (5) and `public.products` (4), each `none`. Choose the `public.customers` row: Studio opens `/tables/public/customers/enrichment`.
- **Other sections.** `Recent playground queries` shows `No queries yet`; `RAG index` shows `Chunks` `15`, `Indexed` `0`, `Model` `Mock lexical`, `Updated: never`; `Tenancy` shows `Not configured` and a button `Draft tenant policy`; `Suggested next actions` lists `Add description to customers` and `Build RAG index for retrieval-augmented queries`.
- **Shortcuts.** Choose `Enrich tables`: Studio opens `/tables`, which lands on `/tables/public/customers/enrichment`. Go back and choose `Draft tenant policy`: Studio opens `/tenancy`.
- **Resync.** Choose `Resync schema`. Studio sends `POST /api/introspect` (status 200), reloads, and still shows `3 tables to go`; `<project>/askdb/schema.json` has a newer modification time, and `tables/*.md` files are untouched.
- **Reflects state.** After the [concepts](./studio-concepts.md), [RAG index](./studio-rag-index.md) and [tenancy](./studio-tenancy.md) recipes, the cards read `CONCEPTS` `1` (`1 defined`), `INDEX HEALTH` `Stale` when the index was built before the policy, and `Tenancy` `Configured`.

## Gotchas

- The `Enrich` entries in `Pending enrichment` aren't links: the whole row is a mouse-only click target, with no keyboard access or link role. Click the row (`row "public.customers …"`); keyboard and screen-reader users can't reach it, which is a product accessibility gap.
- `Suggested next actions` lists `Rebuild index — tables changed since last build` even before any index exists.
- `Resync schema` shows no message: its `Re-introspected <n> tables from sqlite — enrichment preserved.` (or an error) is set on the Overview, then the workspace reload swaps the page for App's loading screen and the Overview remounts without it. A product bug, pinned by the replay `overview-resync-status`, which fails once the message shows. Prove a resync by the request and `schema.json`'s modification time.
- `Recent playground queries` is always empty when the page loads: Studio fetches history only after a Playground question in the same session, even when `playground-history.json` has entries.
- Resync rewrites the `schema.json` of the folder Studio opened from the config's database. On a fixture folder (`schemas/…`) that replaces its tables with the shop's: resync only `askdb`.
