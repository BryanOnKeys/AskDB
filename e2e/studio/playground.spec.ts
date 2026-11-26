/**
 * Replay of the UI steps of verify-askdb's `studio-playground` feature
 * (.agents/skills/verify-askdb/features/studio-playground.md). The API steps are studio-api.test.ts.
 *
 * Protects: the Playground as a user drives it: open, generate SQL in Full schema mode, execute it
 * against shop.db and see the rows.
 * Catches: a UI change that breaks the journey (a renamed control, a broken state change, the
 * results never rendering), which the server tests can't see.
 * No production seam: it drives the built Studio by role and accessible name only.
 */
import { expect, studioRun, test } from "./fixtures.js";

const SQL = "SELECT name, country FROM customers ORDER BY name";
const studio = studioRun();

test("studio-open, studio-generate, studio-execute: a question becomes SQL, then rows", async ({ page }, testInfo) => {
  studio.run.modelReply(SQL);
  await page.goto(`${studio.url}/playground`);

  // studio-open
  await expect(page.getByRole("heading", { name: "Query Playground" })).toBeVisible();
  const question = page.getByRole("textbox", { name: "Natural language question" });
  await expect(question).toHaveAttribute("placeholder", "How many users placed orders last month?");
  const mode = page.getByRole("group", { name: "Retrieval mode" });
  await expect(mode.getByRole("button", { name: "Full schema" })).toBeEnabled();
  await expect(mode.getByRole("button", { name: "RAG" })).toBeDisabled();
  await expect(page.getByText("No index")).toBeVisible();
  await expect(page.getByRole("button", { name: "Execute Query" })).toHaveCount(0);

  // studio-generate
  await question.fill("customers by name");
  await page.getByRole("button", { name: /^Generate SQL/ }).click();
  await expect(page.getByText("Generated SQL.", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Generated SQL" })).toBeVisible();
  await expect(page.getByText(SQL, { exact: true })).toBeVisible();
  await expect(page.getByText("History (1)")).toBeVisible();
  await expect(page.getByText("better-sqlite3 ready")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("studio-generate.png") });

  // studio-execute
  await page.getByRole("button", { name: "Execute Query" }).click();
  await expect(page.getByText(/^4 rows · \d+ms$/)).toBeVisible();
  const results = page.getByRole("table");
  await expect(results.getByRole("columnheader")).toHaveText(["name", "country"]);
  await expect(results.getByRole("row").filter({ has: page.getByRole("cell") })).toHaveText([/Ada\s*UK/, /Grace\s*US/, /Linus\s*FI/, /Margaret\s*US/]);
  await results.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("studio-execute.png") });
});
