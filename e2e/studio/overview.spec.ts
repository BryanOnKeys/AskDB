/**
 * Replay of verify-askdb's `studio-overview` feature (.agents/skills/verify-askdb/features/studio-overview.md).
 *
 * Protects: the Overview's cards and pending list on a fresh shop schema, the row and button
 * shortcuts into Tables and Tenancy, and `Resync schema`.
 * Catches: a landing screen that miscounts, or a shortcut that goes nowhere.
 * No production seam: it drives the built Studio by role and accessible name.
 */
import { statSync } from "node:fs";
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

// Known failure: the success message is set on the Overview, then the workspace reload swaps the
// whole page for App's loading screen, so the Overview remounts without it. When this starts
// passing, drop test.fail and the gotcha in studio-overview.md.
test("overview-resync-status: says what it re-read", async ({ page }) => {
  test.fail(true, "Resync's status message is lost when the workspace reloads");
  await page.goto(`${studio.url}/overview`);
  await page.getByRole("button", { name: "Resync schema" }).click();
  await expect(page.getByText("Re-introspected 3 tables from sqlite — enrichment preserved.")).toBeVisible({ timeout: 3_000 });
});
