/**
 * Replay of verify-askdb's `studio-concepts` feature (.agents/skills/verify-askdb/features/studio-concepts.md).
 *
 * Protects: adding a concept with a table link from the Concepts screen, and saving it to concepts.md.
 * Catches: a form that can't add, a link search that finds nothing, or a save that writes the wrong shape.
 * No production seam: it drives the built Studio and reads the file it writes.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, studioRun, test } from "./fixtures.js";

const studio = studioRun();

test("concepts-empty, concepts-add, concepts-save: a linked concept lands in concepts.md", async ({ page }) => {
  await page.goto(`${studio.url}/concepts`);
  await expect(page.getByRole("heading", { name: "Concepts", level: 1 })).toBeVisible();
  await expect(page.getByText("No concepts yet")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();

  await page.getByRole("button", { name: "Add concept" }).click();
  await expect(page.getByRole("heading", { name: "New Concept" })).toBeVisible();
  await page.getByRole("textbox", { name: "Concept ID" }).fill("lifetime_value");
  await page.getByRole("textbox", { name: /^Label/ }).fill("Lifetime value");
  await page.getByRole("textbox", { name: /^Synonyms/ }).fill("ltv, clv");
  await page.getByRole("textbox", { name: "Search tables or columns" }).fill("customers");
  await page.getByRole("option", { name: /^T\s*public\.customers$/ }).click();
  await page.getByRole("textbox", { name: /^Description/ }).fill("Total quantity a customer has ordered across all orders.");
  // Two buttons share the name while the form is open: the header's and the form's submit.
  await page.getByRole("button", { name: "Add concept" }).last().click();

  await expect(page.getByRole("button", { name: /Lifetime value\s*1 links/ })).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Concepts saved.")).toBeVisible();

  const file = readFileSync(join(studio.run.project, "askdb/concepts.md"), "utf8");
  expect(file).toContain("id: 'concept:lifetime_value'");
  expect(file).toContain("label: Lifetime value");
  expect(file).toMatch(/synonyms:\n\s+- ltv\n\s+- clv/);
  expect(file).toContain("- 'table:public.customers'");
});
