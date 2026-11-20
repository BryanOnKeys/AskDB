/**
 * Replay of verify-askdb's `studio-tables` feature (.agents/skills/verify-askdb/features/studio-tables.md).
 *
 * Protects: the Tables screen: the list and its filters, saving enrichment to tables/<name>.md,
 * drafting every empty field or one field with the model and using a draft, the Schema tab,
 * untracking a table and escalating sensitivity from the Sensitivity tab, and Revert. Every
 * field is found by its own accessible name.
 * Catches: an edit that never saves, a draft that never lands in the file, a tab that shows the
 * wrong columns, a field that loses its name or shares it with another, or a typed value that
 * loses its spaces.
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

  // "Drafts for Description" is the table's own; a column's is "Drafts for Description for <column>".
  await page.getByRole("group", { name: "Drafts for Description", exact: true }).getByRole("button", { name: "Use" }).click();
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

test("tables-enrich-save: Primary entity typed key by key keeps its spaces", async ({ page }) => {
  await page.goto(`${studio.url}/tables/public/customers/enrichment`);
  await page.getByRole("textbox", { name: "Primary entity", exact: true }).pressSequentially("Customer Account");
  await expect(page.getByRole("textbox", { name: "Primary entity", exact: true })).toHaveValue("Customer Account");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved customers.")).toBeVisible();
  expect(tableFile("customers")).toContain("primaryEntity: Customer Account");
});

test("tables-suggest-one: one field's Suggest drafts candidates for that field only", async ({ page }) => {
  studio.run.modelReply("The customer's display name.\n---\nFull name as entered at checkout.", { raw: true });
  await page.goto(`${studio.url}/tables/public/customers/enrichment`);
  await page.getByRole("button", { name: "Suggest Description for name", exact: true }).click();
  const drafts = page.getByRole("group", { name: "Drafts for Description for name", exact: true });
  await expect(drafts.getByRole("button", { name: "Use" })).toHaveCount(2);
  await expect(drafts.getByText("Drafts from the model. Nothing is written until Use and Save.")).toBeVisible();
  await expect(page.getByRole("group", { name: /^Drafts for/ })).toHaveCount(1);

  await drafts.getByRole("button", { name: "Use" }).last().click();
  await expect(drafts).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Description for name", exact: true })).toHaveValue("Full name as entered at checkout.");
  await expect(page.getByRole("textbox", { name: "Description", exact: true })).toHaveValue("");

  // Every other field has a name of its own too.
  for (const name of ["Aliases", "Business vocabulary", "Aliases for name"]) {
    await expect(page.getByRole("textbox", { name, exact: true })).toHaveCount(1);
  }
  await expect(page.getByRole("textbox", { name: /^Enum notes for name\b/ })).toHaveCount(1);
  await expect(page.getByRole("combobox", { name: "Sensitivity override for name", exact: true })).toHaveCount(1);
});

test("tables-revert: Revert discards an unsaved edit", async ({ page }) => {
  await page.goto(`${studio.url}/tables/public/products/enrichment`);
  const description = page.getByRole("textbox", { name: "Description for category", exact: true });
  await description.fill("Edited, then thrown away.");
  await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Revert" }).click();
  await expect(page.getByText("Reverted products.")).toBeVisible();
  await expect(description).toHaveValue("");
  await expect(page.getByRole("button", { name: "Revert" })).toBeDisabled();
});

test("tables-sensitivity: escalate a column, then the table, and see the effective result", async ({ page }) => {
  await page.goto(`${studio.url}/tables/public/customers/sensitivity`);
  const country = page.getByRole("row", { name: /^country/ });
  await page.getByRole("combobox", { name: "Sensitivity override for country", exact: true }).selectOption({ label: "Sensitive" });
  await expect(country.getByRole("cell").last()).toHaveText("sensitive");
  await expect(page.getByRole("row", { name: /^name/ }).getByRole("cell").last()).toHaveText("—");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved customers.")).toBeVisible();
  expect(tableFile("customers")).toMatch(/id: 'table:public\.customers#country'\n\s+sensitive: true/);

  await expect(page.getByText("Effective: not sensitive")).toBeVisible();
  await page.getByRole("combobox", { name: /^Override/ }).selectOption({ label: "Sensitive" });
  await expect(page.getByText(/^Effective:\s*sensitive/)).toBeVisible();
  await expect(page.getByRole("row", { name: /^name/ }).getByRole("cell").last()).toHaveText("sensitive");
});
