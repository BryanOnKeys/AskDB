/**
 * Replay of verify-askdb's `studio-overview` feature (.agents/skills/verify-askdb/features/studio-overview.md).
 *
 * Protects: the Overview's cards and pending list on a fresh shop schema, the row and button
 * shortcuts into Tables and Tenancy (the row's Enrich link from the keyboard), `Resync schema`
 * (its message, and unsaved edits kept), and the saved Playground history on load.
 * Catches: a landing screen that miscounts (or counts one way and lists another), a suggestion
 * that doesn't fit the state, a shortcut that goes nowhere or needs a mouse, a resync that swaps
 * the page for the loading screen and loses its message or the user's unsaved edits, or saved
 * Playground history that stays hidden until the next ask.
 * No production seam: it drives the built Studio by role and accessible name.
 */
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, studioRun, test } from "./fixtures.js";

const studio = studioRun();

test("overview-cards and overview-pending: counts, then a row opens its table", async ({ page }) => {
  await page.goto(`${studio.url}/overview`);
  await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
  await expect(page.getByText("sqlite · askdb").first()).toBeVisible();
  await expect(page.getByText("0 enriched · 0 partial")).toBeVisible();
  await expect(page.getByText("15 chunks · 64d")).toBeVisible();
  await expect(page.getByText("3 tables to go")).toBeVisible();
  await expect(page.getByText("No queries yet")).toBeVisible();
  await expect(page.getByText("Not configured")).toBeVisible();

  const pending = page.getByRole("table").filter({ has: page.getByRole("columnheader", { name: "Cols" }) });
  await expect(pending.getByRole("row").filter({ has: page.getByRole("cell") })).toHaveCount(3);
  await pending.getByRole("row", { name: /public\.customers/ }).click();
  await expect(page).toHaveURL(/\/tables\/public\/customers\/enrichment$/);

  // The keyboard way in: each row's Enrich is a link named for its table.
  await page.goto(`${studio.url}/overview`);
  await page.getByRole("link", { name: "Enrich public.orders" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/tables\/public\/orders\/enrichment$/);
});

test("overview-shortcuts: Enrich tables and Draft tenant policy", async ({ page }) => {
  await page.goto(`${studio.url}/overview`);
  await page.getByRole("button", { name: "Enrich tables" }).click();
  await expect(page).toHaveURL(/\/tables\/public\/customers\/enrichment$/);

  await page.goto(`${studio.url}/overview`);
  await page.getByRole("button", { name: "Draft tenant policy" }).click();
  await expect(page).toHaveURL(/\/tenancy$/);
  await expect(page.getByRole("heading", { name: "Enable Multi-Tenancy" })).toBeVisible();
});

test("overview-resync: re-reads the database into schema.json", async ({ page }) => {
  const schemaJson = join(studio.run.project, "askdb/schema.json");
  const before = statSync(schemaJson).mtimeMs;
  await page.goto(`${studio.url}/overview`);
  const introspect = page.waitForResponse((r) => r.url().endsWith("/api/introspect") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Resync schema" }).click();
  expect((await introspect).status()).toBe(200);
  await expect(page.getByText("3 tables to go")).toBeVisible();
  expect(statSync(schemaJson).mtimeMs).toBeGreaterThan(before);
});

test("overview-resync: says what it re-read, and the page stays put", async ({ page }) => {
  await page.goto(`${studio.url}/overview`);
  const introspect = page.waitForResponse((r) => r.url().endsWith("/api/introspect") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Resync schema" }).click();
  expect((await introspect).status()).toBe(200);
  await expect(page.getByText("Re-introspected 3 tables from sqlite — enrichment preserved.")).toBeVisible();
  await expect(page.getByText("3 tables to go")).toBeVisible();
});

test("overview-resync: an unsaved table edit survives a resync", async ({ page }) => {
  await page.goto(`${studio.url}/tables/public/customers/enrichment`);
  const tags = page.getByRole("textbox", { name: /^Tags/ });
  await tags.fill("unsaved-tag");
  await tags.blur(); // list fields commit on blur
  await page.getByRole("link", { name: "Overview" }).click();
  await page.getByRole("button", { name: "Resync schema" }).click();
  await expect(page.getByText("Re-introspected 3 tables from sqlite — enrichment preserved.")).toBeVisible();
  await page.getByRole("link", { name: /^Tables/ }).click();
  await expect(page.getByRole("textbox", { name: /^Tags/ })).toHaveValue("unsaved-tag");
  await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible();
});

test.describe("overview-history: a project with saved Playground history", () => {
  const QUESTION = "How many customers are in each country?";
  const seeded = studioRun(async (run) => {
    const result = run.cli(["introspect", "--engine", "sqlite", "--url", "shop.db", "--out", "askdb"], { label: "introspect-write" });
    if (result.exitCode !== 0) throw new Error(`introspect failed: ${result.stderr}`);
    const entry = {
      id: "seeded-1",
      timestamp: "2026-11-01T12:00:00.000Z",
      question: QUESTION,
      mode: "full",
      sqlMode: "sql-params",
      sql: "SELECT country, COUNT(*) FROM customers GROUP BY country",
    };
    writeFileSync(join(run.project, "askdb/playground-history.json"), JSON.stringify([entry], null, 2));
    await run.start("studio", "askdb");
  });

  test("overview-history: the saved history shows on load, on the Overview and in the Playground", async ({ page }) => {
    await page.goto(`${seeded.url}/overview`);
    await expect(page.getByRole("cell", { name: QUESTION })).toBeVisible();
    await expect(page.getByText("last 1 queries")).toBeVisible();
    await page.getByRole("link", { name: "Playground" }).click();
    await expect(page.getByText("History (1)")).toBeVisible();
    await expect(page.getByText(QUESTION)).toBeVisible();
  });
});

test("overview-next-actions: no Rebuild index until an index exists, then once it is stale", async ({ page }) => {
  await page.goto(`${studio.url}/overview`);
  await expect(page.getByText("Build RAG index for retrieval-augmented queries")).toBeVisible();
  await expect(page.getByText("Rebuild index — tables changed since last build")).toHaveCount(0);

  await page.getByRole("link", { name: "RAG Index" }).click();
  await page.getByRole("button", { name: "Build Index" }).click();
  await expect(page.getByText("Fresh", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Overview" }).click();
  await expect(page.getByText("Build RAG index for retrieval-augmented queries")).toHaveCount(0);
  await expect(page.getByText("Rebuild index — tables changed since last build")).toHaveCount(0);

  // Untracking a table changes what the index holds, so the index goes stale.
  await page.goto(`${studio.url}/tables/public/products/sensitivity`);
  await page.getByRole("combobox", { name: /^Status/ }).selectOption({ label: "Untracked — excluded from LLM context" });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved products.")).toBeVisible();
  await page.getByRole("link", { name: "Overview" }).click();
  await expect(page.getByText("Rebuild index — tables changed since last build")).toBeVisible();
});

test.describe("overview-cards: a table with aliases and every column described, but no description", () => {
  const studio = studioRun(async (run) => {
    const result = run.cli(["introspect", "--engine", "sqlite", "--url", "shop.db", "--out", "askdb"], { label: "introspect-write" });
    if (result.exitCode !== 0) throw new Error(`introspect failed: ${result.stderr}`);
    mkdirSync(join(run.project, "askdb/tables"), { recursive: true });
    writeFileSync(
      join(run.project, "askdb/tables/customers.md"),
      [
        "---",
        "id: 'table:public.customers'",
        "name: customers",
        "schemaId: askdb",
        "aliases:",
        "  - buyers",
        "columns:",
        "  - id: 'table:public.customers#id'",
        "    description: Row id.",
        "  - id: 'table:public.customers#name'",
        "    description: Display name.",
        "  - id: 'table:public.customers#country'",
        "    description: Country of residence.",
        "---",
        "# Table: customers",
        "",
      ].join("\n"),
    );
    await run.start("studio", "askdb");
  });

  test("overview-cards: it counts as partial and still to go, as the pending list shows it", async ({ page }) => {
    await page.goto(`${studio.url}/overview`);
    await expect(page.getByText("0 enriched · 1 partial")).toBeVisible();
    await expect(page.getByText("3 tables to go")).toBeVisible();
    const pending = page.getByRole("table").filter({ has: page.getByRole("columnheader", { name: "Cols" }) });
    await expect(pending.getByRole("row").filter({ has: page.getByRole("cell") })).toHaveCount(3);
    await expect(pending.getByRole("row", { name: /public\.customers/ })).toContainText("partial");

    // The Tables list's filters count it the same way.
    await page.getByRole("link", { name: /^Tables/ }).click();
    await expect(page.getByRole("button", { name: "Complete 0" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Partial 1" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Not started 2" })).toBeVisible();
  });
});
