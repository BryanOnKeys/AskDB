import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineConfig, loadAskDbConfigProjection } from "./index.js";

const root = resolve(import.meta.dirname, "../../..");
const examples = execFileSync("git", ["ls-files", "-z", "--", "examples/**/askdb.config.ts"], {
  cwd: root,
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean)
  .sort();

// Each example loads as it would once a reader fills in its `.env`, and the same way on every
// machine: CI's own DATABASE_URL must not decide what is checked.
const PLACEHOLDERS: Record<string, string> = {
  DATABASE_URL: "postgres://localhost:5432/askdb_example",
  LAB_LIVE_MODEL_ID: "gpt-4o-mini",
  LAB_REPLAY_BASE_URL: "http://127.0.0.1:4010/v1",
  OPENAI_API_KEY: "sk-placeholder",
  OPENAI_EMBEDDING_MODEL: "text-embedding-3-small",
  OPENAI_MODEL: "gpt-4o-mini",
  SCHEMA_PATH: "./schema",
};

function envNamesRead(example: string): string[] {
  const source = readFileSync(resolve(root, example), "utf8");
  const names = [
    ...source.matchAll(/\benv\(\s*["'`]([A-Z][A-Z0-9_]*)["'`]\s*\)/g),
    ...source.matchAll(/\bprocess\.env\.([A-Z][A-Z0-9_]*)/g),
    ...source.matchAll(/\bprocess\.env\[\s*["'`]([A-Z][A-Z0-9_]*)["'`]\s*\]/g),
  ].map((match) => match[1]!);
  return [...new Set(names)].sort();
}

describe("example configurations", () => {
  beforeEach(() => {
    for (const [name, value] of Object.entries(PLACEHOLDERS)) vi.stubEnv(name, value);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("finds the tracked example configs", () => {
    expect(examples).toContain("examples/express-server/askdb.config.ts");
  });

  it.each(examples)("has a placeholder for every env var %s reads", (example) => {
    const missing = envNamesRead(example).filter((name) => !(name in PLACEHOLDERS));
    expect(missing, `add a placeholder for each to PLACEHOLDERS`).toEqual([]);
  });

  it.each(examples)("loads %s", async (example) => {
    const path = resolve(root, example);
    const { path: loadedPath, projection } = await loadAskDbConfigProjection(dirname(path));

    expect(loadedPath).toBe(path);
    expect(projection).toBeDefined();
    expect(() => defineConfig(projection!.config), example).not.toThrow();
  });
});
