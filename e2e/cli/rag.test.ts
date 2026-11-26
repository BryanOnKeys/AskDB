/**
 * Replay of verify-askdb's `rag` feature (.agents/skills/verify-askdb/features/rag.md).
 *
 * Protects: `askdb rag index` and `rag query` with the mock embedder and the file store: the
 * index files, chunk reuse on a second index, and the best chunk for a question.
 * Catches: the CLI's retrieval path breaking end to end without an AI provider.
 * No production seam: it runs the built CLI on an introspected shop schema.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type AskdbRun, introspectedRun } from "../run.js";

let run: AskdbRun;
beforeAll(async () => {
  run = await introspectedRun();
});
afterAll(async () => {
  await run?.cleanup();
});

describe("rag", () => {
  it("rag-index: indexes 15 chunks and writes the index beside schema.json", () => {
    const result = run.cli(["rag", "index", "askdb"], { label: "rag-index" });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ chunksTotal: 15, chunksIndexed: 15, chunksReused: 0 });
    expect(readdirSync(join(run.project, "askdb")).sort()).toEqual(["schema.embeddings.bin", "schema.embeddings.json", "schema.json", "schema.lock.json"]);
  });

  it("rag-reindex: reuses every unchanged chunk", () => {
    const result = run.cli(["rag", "index", "askdb"], { label: "rag-reindex" });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ chunksTotal: 15, chunksIndexed: 0, chunksReused: 15 });
  });

  it("rag-query: returns the matching column first", () => {
    const result = run.cli(["rag", "query", "askdb", "--question", "customer country", "-k", "3"], { label: "rag-query" });
    expect(result.exitCode, result.stderr).toBe(0);
    const { results } = JSON.parse(result.stdout);
    expect(results).toHaveLength(3);
    expect(results[0].id).toBe("chunk:askdb:table:public.customers#country");
  });
});
