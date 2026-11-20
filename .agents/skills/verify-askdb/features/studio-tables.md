# Studio Tables

Studio's Tables screen (`/tables/:schema/:name/…`) is where a user enriches each table for NL→SQL: descriptions, aliases, tags, vocabulary, example questions and per-column notes (Enrichment tab), reads its columns and relationships (Schema tab), and marks sensitivity or excludes it from the model (Sensitivity tab). `Save` writes the table's markdown file, `tables/<name>.md`, in the schema folder.

## Sub-features

- `tables-list` opens the first table from `/tables`, and searches and filters the table list. Scripted: `e2e/studio/tables.spec.ts`.
- `tables-enrich-save` saves an edit (tags; Primary entity typed key by key, spaces kept) to `tables/<name>.md` front matter. Scripted: `e2e/studio/tables.spec.ts`.
- `tables-suggest-all` drafts every empty description and alias field with the model, and a used draft saves to the file. Scripted: `e2e/studio/tables.spec.ts`.
- `tables-suggest-one` drafts one field with its own `Suggest` button. Scripted: `e2e/studio/tables.spec.ts`.
- `tables-schema` lists the columns (name, type, nullable, PK, sensitive) and relationships. Scripted: `e2e/studio/tables.spec.ts`.
- `tables-untrack` saves `tracked: false` from the Sensitivity tab's `Status`. Scripted: `e2e/studio/tables.spec.ts`.
- `tables-sensitivity` escalates a table or column to sensitive, and shows the effective result. Scripted: `e2e/studio/tables.spec.ts`.
- `tables-revert` discards unsaved edits with `Revert`. Scripted: `e2e/studio/tables.spec.ts`.

## How to get to it (user POV)

- Choose `Tables` in Studio's navigation (it opens the first table), a table in the list, or a row in the Overview's `Pending enrichment`.
- Choose the `Enrichment`, `Schema` or `Sensitivity` tab (links, with `aria-current="page"` on the active one).

## Driving it with control-askdb

Preconditions:

- Baseline from the README, with `askdb/schema.json` written by the [introspect](./introspect.md) recipe and no `askdb/tables/`.
- Run `vctl studio start askdb`, and open `http://127.0.0.1:<port>/tables`.

- **List.** Studio opens `/tables/public/customers/enrichment` with the heading `public.customers` (level 1) and `3 columns`. The side panel has the heading `Tables`, `3 tables`, a textbox `Search tables`, and filter buttons `Complete 0`, `Partial 0`, `Not started 3`. Type `ord` into `Search tables`: only `orders 5 cols` remains. Choose it: Studio opens `/tables/public/orders/enrichment`.
- **Save an edit.** On `customers`, type `crm, people` into the textbox `Tags`, then move focus out of it. The top bar shows `Unsaved changes` and `Save` is enabled. Choose `Save`: the status `Saved customers.` appears. Read `<project>/askdb/tables/customers.md`: its front matter has `tags:` `crm` and `people`. Type `Customer Account` key by key into the textbox `Primary entity` and save: the file has `primaryEntity: Customer Account`, spaces kept.
- **Field names.** The table's fields are the textboxes `Description`, `Aliases`, `Primary entity` and `Business vocabulary`. Each column's are named for the column: `Description for <column>`, `Aliases for <column>`, `Enum notes for <column>` (the name goes on with the hint) and the combobox `Sensitivity override for <column>`. Each field's suggest button is `Suggest <field>` (`Suggest Description`, `Suggest Description for name`), and its drafts group is `Drafts for <field>`.
- **Draft every empty field.** Set a raw reply: `vctl model reply --raw "A shop customer, one row per buyer."`. On `products`, the card reads `10 empty description and alias fields on this table.` Choose `Suggest all empty fields`; the confirmation `Draft 10 empty fields with 10 model calls, one per field?` appears. Choose `Run 10 calls`: `Drafting field <i> of 10…`, then `Drafted 10 fields. Review each draft, then Use or Dismiss it.` In the group `Drafts for Description` (the table's own; a column's is `Drafts for Description for <column>`), choose `Use`, then `Save`: `Saved products.`, and `tables/products.md` holds the sentence.
- **One field.** Set a raw reply with two candidates: `vctl model reply --raw $'The customer\'s display name.\n---\nFull name as entered at checkout.'`. On `customers`, choose `Suggest Description for name`: the group `Drafts for Description for name` shows the 2 candidates, each with `Use`, one `Dismiss`, and the footer `Drafts from the model. Nothing is written until Use and Save.` No other field gets drafts. Choose the second `Use`: the group closes and `Description for name` holds `Full name as entered at checkout.`, while the table's `Description` stays empty.
- **Schema tab.** On `orders`, choose `Schema`: `5 columns · 2 relationships`, the heading `Column Details` over a table with rows such as `id INTEGER No PK` and `customer_id INTEGER No`, and the heading `Relationships` listing `table:public.orders#customer_id` → `table:public.customers#id`.
- **Untrack.** Choose `Sensitivity`. Under `LLM tracking`, select `Untracked — excluded from LLM context` in the combobox `Status`, then `Save`: `Saved orders.`, and `tables/orders.md` has `tracked: false`.
- **Sensitivity.** Under `Table-level sensitivity`, the combobox `Override` (`Inherit physical metadata`, `Sensitive`, `Not sensitive`) and `Effective: not sensitive`. Under `Column sensitivity`, each row has an override combobox named `Sensitivity override for <column>` (`Inherit`, `Sensitive`, `Not sensitive`). On `customers`, set `Sensitivity override for country` to `Sensitive`: the row's last cell shows `sensitive`, and after `Save` the column's entry in the file has `sensitive: true`. Then set the table's `Override` to `Sensitive`: `Effective: sensitive`, and every column row shows `sensitive`. On `schemas/orders-users-sensitive.schema`, `users.secret_recovery_token` is physically sensitive, so its `Not sensitive` option is disabled.
- **Revert.** On `products`, type into `Description for category`: `Unsaved changes`. Choose `Revert`: the status `Reverted products.` appears, the field is empty again, and `Revert` is disabled.

## Gotchas

- Tags, Aliases, Enum notes and Synonyms commit on blur. Until focus leaves the field, `Save` stays disabled.
- `Unsaved changes` appears twice (the top bar's pill, and a banner with a full stop). Match it exactly.
- `vctl model reply` wraps bare text in a ```` ```sql ```` block, which a suggestion would show as one candidate with the fence in it. Use `--raw` for suggestions.
- Saving a table makes the RAG index `Stale`. A save with no column text leaves each column reported missing (`3 missing`) and in Settings' warnings.
