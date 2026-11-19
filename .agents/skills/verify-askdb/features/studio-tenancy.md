# Studio Tenancy

Studio's Tenancy screen (`/tenancy`) creates and edits the schema's tenant policy: which table is the tenant root, which tables are scoped to it and through which column, which are global, and whether enforcement is strict or warn. A user drafts it with the model or configures it by hand, reviews it, and saves it to `tenant-policy.md` in the schema folder.

## Sub-features

- `tenancy-choose` offers `Draft with AI` and `Configure manually` when the schema has no policy. Scripted: `e2e/studio/tenancy.spec.ts`.
- `tenancy-manual` builds a policy from the root table, its tenant ID column, global tables and scoped tables. Scripted: `e2e/studio/tenancy.spec.ts`.
- `tenancy-ai-draft` asks the model for a policy and opens it for review. Scripted: `e2e/studio/tenancy.spec.ts`.
- `tenancy-save` writes `tenant-policy.md` from the review screen and shows the read-only `Multi-Tenancy` summary. Scripted: `e2e/studio/tenancy.spec.ts`.
- `tenancy-edit` edits an existing policy and saves the change. Agent-driven.

## How to get to it (user POV)

- Choose `Tenancy` in Studio's navigation, or `Draft tenant policy` on the Overview.
- With no policy: choose `Draft with AI` or `Configure manually`, review, then `Confirm & Save`. With a policy: choose `Edit`, then `Save Changes`.

## Driving it with control-askdb

Preconditions:

- Baseline from the README, with `askdb/schema.json` written by the [introspect](./introspect.md) recipe and no `askdb/tenant-policy.md`. For `tenancy-edit`, use `schemas/agency-multi-tenant.schema` instead (`vctl studio start schemas/agency-multi-tenant.schema`), which has a policy.
- Run `vctl studio start askdb`, and open `http://127.0.0.1:<port>/tenancy`.

- **Choose.** The heading `Enable Multi-Tenancy`, the subtitle `Configure tenant isolation for your schema`, and two buttons whose names start `Draft with AI` and `Configure manually`.
- **Manual.** Choose `Configure manually`: the heading `Manual Configuration`, `Back`, and `Pick the root table first.` Select `public.customers` in the combobox `Root table`; a combobox `Tenant ID column` appears and `Label` fills with `customers`. Select `id (INTEGER, PK)`. Check `public.products` under `Global Tables (optional)`. Under `Scoped Tables (optional)`, select `customer_id (INTEGER)` in the combobox `public.orders` (default `Not scoped`). `Strict` is the default mode. Choose `Review & Confirm`.
- **Review.** The heading `Review Tenant Policy` with the badge `Draft`, buttons `Start Over` and `Confirm & Save`, headings `Tenant Roots (1)` and `Scoped Tables (1)`, `public.products` under `Global Tables`, and a `Frontmatter Preview` of the JSON. Each root's label is the textbox `Label for <root id>`, its name followed by the hint, so match it by prefix (here `Label for table:public.customers`, holding `customers`), each scoped table has a button `Remove scoped table <id>` (roots, when there are several, `Remove root <id>`; hierarchy edges and polymorphic tables likewise), and the body is the textbox `Policy body`: type `Customers are tenants.` into it.
- **Save.** Choose `Confirm & Save`. The heading changes to `Multi-Tenancy` (level 1), with `100% table coverage (3/3)` and `strict`. Read `<project>/askdb/tenant-policy.md`: front matter `schemaId: askdb`, `enforcement: strict`, a root `table:public.customers` with `tenantIdColumn: 'table:public.customers#id'`, `table:public.orders` scoped through `table:public.orders#customer_id`, and global `table:public.products`, and the body holds `Customers are tenants.`
- **AI draft.** Set the model's reply to the policy as raw JSON: `vctl model reply --raw '{"frontmatter": {…}, "body": "## Hierarchy …"}'`, with the same front matter as above. Choose `Draft with AI`: the status `Analyzing schema and drafting tenant policy...`, then the review screen with the draft. `Confirm & Save` writes it, body included.
- **Edit.** On the agency schema: `Multi-Tenancy`, `Schema: agency-multi-tenant · 100% table coverage (9/9)`, `Edit`. Choose `Edit`: the heading `Edit Tenant Policy`, badge `Saved`, `Cancel` and `Save Changes`. Switch to `Warn` and `Save Changes`: the file's `enforcement` reads `warn`.

## Gotchas

- The `Edit` steps come from the source and haven't been driven yet. The first run that drives them confirms them or fixes this file.
- The AI draft parses the model's whole reply as JSON. A reply sent through `vctl model reply` without `--raw` is wrapped in a SQL fence and fails with `AI returned invalid JSON for tenant policy suggestion.` A reply whose front matter the loader rejects fails with `AI-generated tenant policy frontmatter is invalid: …`.
- `AI draft ready for review.` never shows, and neither does `Tenant policy saved.`: the page moves to the next screen first. Assert the next screen's heading instead.
- `Strict` and `Warn` carry no pressed state; only styling shows which is active.
- A global table's checkbox and a scoped table's combobox share the table's name (`public.orders`). Target them by role, not by label alone.
- Picking the root table overwrites `Label` with the table's name. Set the label after the root.
- `Resync schema` on the agency folder rewrites its `schema.json` with the shop's tables, leaving its policy pointing at tables that no longer exist. Resync only `askdb`.
