/**
 * Replay of verify-askdb's `studio-settings` feature (.agents/skills/verify-askdb/features/studio-settings.md).
 *
 * Protects: the read-only Settings screen showing the loaded workspace, RAG store and schema warnings.
 * Catches: Settings reporting a different config than the one Studio runs with.
 * No production seam: it drives the built Studio.
 */
import { expect, studioRun, test } from "./fixtures.js";

const studio = studioRun();

test("settings-workspace, settings-rag-store, settings-warnings", async ({ page }) => {
  await page.goto(`${studio.url}/settings`);
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  // Each setting is a label/value pair; assert the pair as the page reads it.
  const main = page.getByRole("main").last();
  for (const [label, value] of [
    ["Schema ID", "askdb"],
    ["AI provider", "openai"],
    ["Model", "gpt-4o-mini"],
    ["AI suggestions", "Configured"],
    ["Embedder", "mock \\(local lexical\\)"],
    ["Store", "file"],
    ["Lock file", "missing"],
  ]) {
    await expect(main).toContainText(new RegExp(`${label}\\s*${value}`));
  }
  await expect(main).toContainText(/Schema path\s*\S+\/project\/askdb/);
  await expect(page.getByText('"kind": "missing_table_md"')).toHaveCount(3);
});
