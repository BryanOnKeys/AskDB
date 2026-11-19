/**
 * Replay of verify-askdb's `studio-overview` feature (.agents/skills/verify-askdb/features/studio-overview.md).
 *
 * Protects: the Overview's cards and pending list on a fresh shop schema, the row and button
 * shortcuts into Tables and Tenancy, `Resync schema`, and the saved Playground history on load.
 * Catches: a landing screen that miscounts, a shortcut that goes nowhere, or saved Playground
 * history that stays hidden until the next ask.
 * No production seam: it drives the built Studio by role and accessible name.
 */
import { statSync, writeFileSync } from "node:fs";
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

// Known bug: the success message is set on the Overview, then the workspace reload swaps the
// whole page for App's loading screen, so the Overview remounts without it. The steps before the
// last check must pass; only the last check pins the bug, and it fails once the bug is fixed:
// then assert the message is visible instead, and drop the gotcha in studio-overview.md.
test("overview-resync-status: known bug, Resync's message is lost on reload", async ({ page }) => {
  await page.goto(`${studio.url}/overview`);
  const introspect = page.waitForResponse((r) => r.url().endsWith("/api/introspect") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Resync schema" }).click();
  expect((await introspect).status()).toBe(200);
  await expect(page.getByText("3 tables to go")).toBeVisible();
  const shown = await page
    .getByText("Re-introspected 3 tables from sqlite — enrichment preserved.")
    .waitFor({ timeout: 3_000 })
    .then(() => true, () => false);
  expect(shown, "Resync's message now shows: the bug is fixed, so assert it instead and drop the gotcha").toBe(false);
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
