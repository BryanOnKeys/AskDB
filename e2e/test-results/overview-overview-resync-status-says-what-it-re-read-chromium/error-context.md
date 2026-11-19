# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: overview.spec.ts >> overview-resync-status: says what it re-read
- Location: studio/overview.spec.ts:56:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Re-introspected 3 tables from sqlite — enrichment preserved.')
Expected: visible
Timeout: 3000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByText('Re-introspected 3 tables from sqlite — enrichment preserved.') with timeout 3000ms
  - waiting for getByText('Re-introspected 3 tables from sqlite — enrichment preserved.')

```

```yaml
- list:
  - listitem:
    - link "AskDB AskDB Studio":
      - /url: /
      - img "AskDB"
      - text: AskDB Studio
- list:
  - listitem:
    - link "Overview":
      - /url: /overview
  - listitem:
    - link "Tables":
      - /url: /tables
    - text: "3"
  - listitem:
    - link "Concepts":
      - /url: /concepts
    - text: "0"
  - listitem:
    - link "Tenancy":
      - /url: /tenancy
  - listitem:
    - link "RAG Index":
      - /url: /rag-index
  - listitem:
    - link "Playground":
      - /url: /playground
- list:
  - listitem:
    - link "Settings":
      - /url: /settings
  - listitem:
    - button "Dark mode"
- text: sqlite · askdb
- main:
  - button "Toggle Sidebar"
  - text: Overview No index
  - main:
    - heading "Overview" [level=1]
    - text: sqlite · askdb
    - button "Resync schema"
    - button "Enrich tables"
    - text: Tables 3 0 enriched · 0 partial Concepts 0 Index health None 15 chunks · 64d Sensitivity coverage 0%
    - heading "Pending enrichment" [level=3]
    - text: 3 tables to go
    - table:
      - rowgroup:
        - row "Table Cols Status Actions":
          - columnheader "Table"
          - columnheader "Cols"
          - columnheader "Status"
          - columnheader "Actions"
      - rowgroup:
        - row "public.customers 3 none Enrich":
          - cell "public.customers"
          - cell "3"
          - cell "none"
          - cell "Enrich"
        - row "public.orders 5 none Enrich":
          - cell "public.orders"
          - cell "5"
          - cell "none"
          - cell "Enrich"
        - row "public.products 4 none Enrich":
          - cell "public.products"
          - cell "4"
          - cell "none"
          - cell "Enrich"
    - heading "Recent playground queries" [level=3]
    - text: last 0 queries
    - table:
      - rowgroup:
        - row "Question Mode Time":
          - columnheader "Question"
          - columnheader "Mode"
          - columnheader "Time"
      - rowgroup:
        - row "No queries yet":
          - cell "No queries yet"
    - heading "RAG index" [level=3]
    - text: "Chunks 15 Indexed 0 Dimensions 64 Model Mock lexical Updated: never"
    - heading "Tenancy" [level=3]
    - text: Not configured Multi-tenant scoping isn't set. Generated SQL won't enforce row-level isolation.
    - button "Draft tenant policy"
    - heading "Suggested next actions" [level=3]
    - text: Add description to customers Build RAG index for retrieval-augmented queries Rebuild index — tables changed since last build Start enriching tables to improve SQL generation quality
```

# Test source

```ts
  1  | /**
  2  |  * Replay of verify-askdb's `studio-overview` feature (.agents/skills/verify-askdb/features/studio-overview.md).
  3  |  *
  4  |  * Protects: the Overview's cards and pending list on a fresh shop schema, the row and button
  5  |  * shortcuts into Tables and Tenancy, and `Resync schema`.
  6  |  * Catches: a landing screen that miscounts, or a shortcut that goes nowhere.
  7  |  * No production seam: it drives the built Studio by role and accessible name.
  8  |  */
  9  | import { statSync } from "node:fs";
  10 | import { join } from "node:path";
  11 | import { expect, studioRun, test } from "./fixtures.js";
  12 | 
  13 | const studio = studioRun();
  14 | 
  15 | test("overview-cards and overview-pending: counts, then a row opens its table", async ({ page }) => {
  16 |   await page.goto(`${studio.url}/overview`);
  17 |   await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
  18 |   await expect(page.getByText("sqlite · askdb").first()).toBeVisible();
  19 |   await expect(page.getByText("0 enriched · 0 partial")).toBeVisible();
  20 |   await expect(page.getByText("15 chunks · 64d")).toBeVisible();
  21 |   await expect(page.getByText("3 tables to go")).toBeVisible();
  22 |   await expect(page.getByText("No queries yet")).toBeVisible();
  23 |   await expect(page.getByText("Not configured")).toBeVisible();
  24 | 
  25 |   const pending = page.getByRole("table").filter({ has: page.getByRole("columnheader", { name: "Cols" }) });
  26 |   await expect(pending.getByRole("row").filter({ has: page.getByRole("cell") })).toHaveCount(3);
  27 |   await pending.getByRole("row", { name: /public\.customers/ }).click();
  28 |   await expect(page).toHaveURL(/\/tables\/public\/customers\/enrichment$/);
  29 | });
  30 | 
  31 | test("overview-shortcuts: Enrich tables and Draft tenant policy", async ({ page }) => {
  32 |   await page.goto(`${studio.url}/overview`);
  33 |   await page.getByRole("button", { name: "Enrich tables" }).click();
  34 |   await expect(page).toHaveURL(/\/tables\/public\/customers\/enrichment$/);
  35 | 
  36 |   await page.goto(`${studio.url}/overview`);
  37 |   await page.getByRole("button", { name: "Draft tenant policy" }).click();
  38 |   await expect(page).toHaveURL(/\/tenancy$/);
  39 |   await expect(page.getByRole("heading", { name: "Enable Multi-Tenancy" })).toBeVisible();
  40 | });
  41 | 
  42 | test("overview-resync: re-reads the database into schema.json", async ({ page }) => {
  43 |   const schemaJson = join(studio.run.project, "askdb/schema.json");
  44 |   const before = statSync(schemaJson).mtimeMs;
  45 |   await page.goto(`${studio.url}/overview`);
  46 |   const introspect = page.waitForResponse((r) => r.url().endsWith("/api/introspect") && r.request().method() === "POST");
  47 |   await page.getByRole("button", { name: "Resync schema" }).click();
  48 |   expect((await introspect).status()).toBe(200);
  49 |   await expect(page.getByText("3 tables to go")).toBeVisible();
  50 |   expect(statSync(schemaJson).mtimeMs).toBeGreaterThan(before);
  51 | });
  52 | 
  53 | // Known failure: the success message is set on the Overview, then the workspace reload swaps the
  54 | // whole page for App's loading screen, so the Overview remounts without it. When this starts
  55 | // passing, drop test.fail and the gotcha in studio-overview.md.
  56 | test("overview-resync-status: says what it re-read", async ({ page }) => {
  57 |   test.fail(true, "Resync's status message is lost when the workspace reloads");
  58 |   await page.goto(`${studio.url}/overview`);
  59 |   await page.getByRole("button", { name: "Resync schema" }).click();
> 60 |   await expect(page.getByText("Re-introspected 3 tables from sqlite — enrichment preserved.")).toBeVisible({ timeout: 3_000 });
     |                                                                                                ^ Error: expect(locator).toBeVisible() failed
  61 | });
  62 | 
```