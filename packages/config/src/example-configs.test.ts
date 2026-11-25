import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { defineConfig, loadAskDbConfigProjection } from "./index.js";

const root = resolve(import.meta.dirname, "../../..");
const examples = execFileSync("git", ["ls-files", "-z", "--", "examples/**/askdb.config.ts"], {
  cwd: root,
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean)
  .sort();

describe("example configurations", () => {
  it("finds the tracked example configs", () => {
    expect(examples).toContain("examples/express-server/askdb.config.ts");
  });

  it.each(examples)("loads %s", async (example) => {
    const path = resolve(root, example);
    const { path: loadedPath, projection } = await loadAskDbConfigProjection(dirname(path));

    expect(loadedPath).toBe(path);
    expect(projection).toBeDefined();
    expect(() => defineConfig(projection!.config), example).not.toThrow();
  });
});
