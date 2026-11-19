/**
 * Replay of verify-askdb's `studio-tables` feature (.agents/skills/verify-askdb/features/studio-tables.md).
 *
 * Protects: the Tables screen: the list and its filters, saving enrichment to tables/<name>.md,
 * drafting every empty field with the model and using a draft, the Schema tab, and untracking a
 * table from the Sensitivity tab.
 * Catches: an edit that never saves, a draft that never lands in the file, or a tab that shows
 * the wrong columns.
 * No production seam: it drives the built Studio (fake model for drafts) and reads the files it writes.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, studioRun, test } from "./fixtures.js";

const studio = studioRun();
const tableFile = (name: string) => readFileSync(join(studio.run.project, "askdb/tables", `${name}.md`), "utf8");

test("tables-list: /tables opens the first table, and the list filters", async ({ page }) => {
  await page.goto(`${studio.url}/tables`);
  await expect(page).toHaveURL(/\/tables\/public\/customers\/enrichment$/);
  await expect(page.getByRole("heading", { name: "public.customers", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Not started\s*3$/ })).toBeVisible();

  await page.getByRole("textbox", { name: "Search tables" }).fill("ord");
  await expect(page.getByRole("button", { name: /^orders\s*5 cols$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^customers\s*3 cols$/ })).toHaveCount(0);
  await page.getByRole("button", { name: /^orders\s*5 cols$/ }).click();
  await expect(page).toHaveURL(/\/tables\/public\/orders\/enrichment$/);
});

test("tables-enrich-save: tags save to tables/customers.md", async ({ page }) => {
  await page.goto(`${studio.url}/tables/public/customers/enrichment`);
  const save = page.getByRole("button", { name: "Save", exact: true });
  await expect(save).toBeDisabled();
  const tags = page.getByRole("textbox", { name: /^Tags/ });
  await tags.fill("crm, people");
  await tags.blur(); // list fields commit on blur
  await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible();
  await save.click();
  await expect(page.getByText("Saved customers.")).toBeVisible();
  expect(tableFile("customers")).toMatch(/tags:\n\s+- crm\n\s+- people/);
});

test("tables-suggest-all: drafts every empty field, and a used draft saves", async ({ page }) => {
  studio.run.modelReply("A shop customer, one row per buyer.", { raw: true });
  await page.goto(`${studio.url}/tables/public/products/enrichment`);
  await expect(page.getByText("10 empty description and alias fields on this table.")).toBeVisible();
  await page.getByRole("button", { name: "Suggest all empty fields" }).click();
  await expect(page.getByText("Draft 10 empty fields with 10 model calls, one per field?")).toBeVisible();
  await page.getByRole("button", { name: "Run 10 calls" }).click();
  await expect(page.getByText("Drafted 10 fields. Review each draft, then Use or Dismiss it.")).toBeVisible({ timeout: 30_000 });
  expect(studio.run.modelRequests().length).toBeGreaterThanOrEqual(10);

  // The first "Drafts for Description" group is the table's own description.
  await page.getByRole("group", { name: "Drafts for Description" }).first().getByRole("button", { name: "Use" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved products.")).toBeVisible();
  expect(tableFile("products")).toContain("A shop customer, one row per buyer.");
});

test("tables-schema: the Schema tab lists columns and relationships", async ({ page }) => {
  await page.goto(`${studio.url}/tables/public/orders/schema`);
  await expect(page.getByText("5 columns · 2 relationships")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Column Details" })).toBeVisible();
  const columns = page.getByRole("table");
  await expect(columns.getByRole("row", { name: /^id\s+INTEGER\s+No\s+PK/ })).toBeVisible();
  await expect(columns.getByRole("row", { name: /^customer_id\s+INTEGER\s+No/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Relationships" })).toBeVisible();
  await expect(page.getByText("table:public.orders#customer_id")).toBeVisible();
});

test("tables-untrack: the Sensitivity tab saves tracked: false", async ({ page }) => {
  await page.goto(`${studio.url}/tables/public/orders/sensitivity`);
  await expect(page.getByRole("heading", { name: "LLM tracking" })).toBeVisible();
  await page.getByRole("combobox", { name: /^Status/ }).selectOption({ label: "Untracked — excluded from LLM context" });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved orders.")).toBeVisible();
  expect(tableFile("orders")).toContain("tracked: false");
});
