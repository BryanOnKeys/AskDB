# Studio Concepts

Studio's Concepts screen (`/concepts`) keeps the schema's cross-table vocabulary: a concept has an ID, a label, synonyms, links to tables or columns, and a description. Studio saves them to `concepts.md` in the schema folder, and RAG indexes each concept as a chunk.

## Sub-features

- `concepts-empty` shows `No concepts yet` and an `Add concept` button when the schema has none. Scripted: `e2e/studio/concepts.spec.ts`.
- `concepts-add` adds a concept from the `New Concept` form, linked to a table found by search. Scripted: `e2e/studio/concepts.spec.ts`.
- `concepts-save` writes the concepts to `concepts.md` front matter. Scripted: `e2e/studio/concepts.spec.ts`.

## How to get to it (user POV)

- Choose `Concepts` in Studio's navigation, or open `/concepts`.
- Choose `Add concept`, fill the form, choose the form's `Add concept`, then the page's `Save`.

## Driving it with control-askdb

Preconditions:

- Baseline from the README, with `askdb/schema.json` written by the [introspect](./introspect.md) recipe, and no `askdb/concepts.md`.
- Run `vctl studio start askdb`, and open `http://127.0.0.1:<port>/concepts` in the session's browser tool.

- **Empty.** The page shows the heading `Concepts` (level 1), the subtitle `Cross-table domain vocabulary for NL→SQL grounding`, a searchbox `Search concepts`, `No concepts yet`, and `Revert` and `Save` disabled.
- **Open the form.** Choose `Add concept`. A heading `New Concept` appears with textboxes `Concept ID` (placeholder `revenue`), `Label`, `Synonyms`, `Search tables or columns` and `Description`, and buttons `Cancel` and `Add concept` (disabled until the form is valid).
- **Fill it.** Type `lifetime_value` into `Concept ID`, `Lifetime value` into `Label`, `ltv, clv` into `Synonyms`, and `customers` into `Search tables or columns`. Options appear: `T public.customers`, then `C public.customers → id`, `→ name`, `→ country`. Choose `T public.customers`; it shows as a chip under `Links`, with a button `Remove link to public.customers` (Enter or Space removes it, as a click does). Type a sentence into `Description`.
- **Add.** Choose the form's `Add concept` (the last button with that name). The list shows `Lifetime value` with `1 links`, the count reads `1`, and `Save` is enabled.
- **Save.** Choose `Save`. The status `Concepts saved.` appears and `Save` is disabled again. Read `<project>/askdb/concepts.md`: its front matter lists `id: 'concept:lifetime_value'`, `label: Lifetime value`, synonyms `ltv` and `clv`, links `'table:public.customers'` and the description.

## Gotchas

- Two buttons are named `Add concept` while the form is open: the header's and the form's submit. Target the form's by position (the last one).
- `Label`, `Synonyms` and `Description` take their accessible names from their labels, which include the hint text (`Label Human-readable name, e.g. "Revenue"`). Match those names by prefix, not exactly.
- Saving also rewrites `schema.embeddings.json` and `schema.embeddings.bin`. After a save, the RAG index reports `Stale` until it is built again.
