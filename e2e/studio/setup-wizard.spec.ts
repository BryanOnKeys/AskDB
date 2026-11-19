/**
 * Replay of verify-askdb's `studio-setup-wizard` feature (.agents/skills/verify-askdb/features/studio-setup-wizard.md).
 *
 * Protects: Studio's first run: writing askdb.config.ts from the wizard when the project has none,
 * and introspecting from the browser when only the schema folder is missing.
 * Catches: a wizard that writes a broken config, or an introspection that never opens the app.
 * No production seam: it drives the built Studio in projects with no config or no schema folder.
 */
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { AskdbRun } from "../run.js";
import { expect, studioRun, test } from "./fixtures.js";

test.describe("wizard: no config", () => {
  const studio = studioRun(async () => {
    const run = await AskdbRun.create();
    rmSync(join(run.project, "askdb.config.ts"));
    await run.start("studio", null);
    return run;
  });

  test("wizard-config, wizard-env, wizard-introspect: config written, then the app opens", async ({ page }) => {
    await page.goto(`${studio.url}/`);
    await expect(page.getByRole("heading", { name: "Set up AskDB" })).toBeVisible();
    await expect(page.getByText(/No askdb\.config\.ts found in/)).toBeVisible();
    await page.getByRole("combobox", { name: /^Database engine/ }).selectOption({ label: "SQLite" });
    await page.getByRole("textbox", { name: /^SQLite file path/ }).fill("./shop.db");
    await page.getByRole("button", { name: "Write askdb.config.ts" }).click();

    await expect(page.getByText("config written")).toBeVisible();
    await expect(page.getByRole("heading", { name: "2 · Add your secrets to .env" })).toBeVisible();
    const config = readFileSync(join(studio.run.project, "askdb.config.ts"), "utf8");
    expect(config).toMatch(/provider: "sqlite"/);
    expect(config).toContain('file: "./shop.db"');
    expect(existsSync(join(studio.run.project, ".env.example"))).toBe(true);

    await page.getByRole("button", { name: "Run introspection" }).click();
    await expect(page).toHaveURL(/\/overview$/);
    await expect(page.getByText("3 tables to go")).toBeVisible();
    expect(existsSync(join(studio.run.project, "askdb/schema.json"))).toBe(true);
  });
});

test.describe("wizard: config, no schema", () => {
  const studio = studioRun(async () => {
    const run = await AskdbRun.create();
    await run.start("studio", null);
    return run;
  });

  test("wizard-introspect: introspects from the browser and opens the Overview", async ({ page }) => {
    await page.goto(`${studio.url}/`);
    await expect(page.getByText(/Config found at .*askdb\.config\.ts, but no schema artifact yet/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "2 · Introspect your database" })).toBeVisible();
    await page.getByRole("button", { name: "Run introspection" }).click();
    await expect(page).toHaveURL(/\/overview$/);
    await expect(page.getByText("3 tables to go")).toBeVisible();
  });
});
