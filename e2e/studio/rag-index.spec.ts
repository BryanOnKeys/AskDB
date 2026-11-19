/**
 * Replay of verify-askdb's `studio-rag-index` feature (.agents/skills/verify-askdb/features/studio-rag-index.md).
 *
 * Protects: the index status before a build, `Build Index` with Studio's mock embedder and file
 * store, and the query debugger's ranking.
 * Catches: a build that writes nothing, a status that never turns fresh, or retrieval that ranks wrongly.
 * No production seam: it drives the built Studio and lists the files it writes.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, studioRun, test } from "./fixtures.js";

const studio = studioRun();

test("rag-ui-status, rag-ui-build, rag-ui-query: build the index, then retrieve", async ({ page }) => {
  await page.goto(`${studio.url}/rag-index`);
  await expect(page.getByRole("heading", { name: "RAG Index", level: 1 })).toBeVisible();
  await expect(page.getByText("No index", { exact: true }).last()).toBeVisible();
  await expect(page.getByText("Updated: never")).toBeVisible();
  await expect(page.getByText("Store: file")).toBeVisible();
  await expect(page.getByRole("button", { name: "Query RAG" })).toBeDisabled();

  await page.getByRole("button", { name: "Build Index" }).click();
  await expect(page.getByText("Indexed 15 chunks, reused 0.")).toBeVisible();
  await expect(page.getByText("Index present")).toBeVisible();
  await expect(page.getByText("Fresh", { exact: true })).toBeVisible();
  expect(readdirSync(join(studio.run.project, "askdb"))).toEqual(expect.arrayContaining(["schema.embeddings.json", "schema.embeddings.bin", "schema.lock.json"]));

  await page.getByRole("textbox", { name: "Question" }).fill("customer country");
  await page.getByRole("button", { name: "Query RAG" }).click();
  const chunks = page.getByRole("heading", { level: 4 });
  await expect(chunks.first()).toHaveText("chunk:askdb:table:public.customers#country");
  await expect(chunks.nth(1)).toHaveText("chunk:askdb:table:public.customers");
});
