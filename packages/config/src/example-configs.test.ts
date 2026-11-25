import { dirname } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineConfig, loadAskDbConfigProjection } from "./index.js";
import {
  EXAMPLE_ENV_PLACEHOLDERS,
  envNamesRead,
  exampleEnvNames,
  repoPath,
  trackedExampleConfigs,
} from "./test-utils.js";

const examples = trackedExampleConfigs();

// Each example loads as it would once a reader fills in its `.env`, and the same way on every
// machine: CI's own DATABASE_URL must not decide what is checked. example-configs-unset.test.ts
// loads them with nothing set; the loader caches a config per process, so that needs its own file.
describe("example configurations, with placeholder env values", () => {
  beforeEach(() => {
    for (const [name, value] of Object.entries(EXAMPLE_ENV_PLACEHOLDERS)) vi.stubEnv(name, value);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("finds the tracked example configs", () => {
    expect(examples).toContain("examples/express-server/askdb.config.ts");
  });

  it("reads env var names from every form a config uses", () => {
    const source = [
      'const a = env("A_VAR");',
      "const b = process.env.B_VAR;",
      'const c = process.env["C_VAR"];',
      'const { D_VAR, E_VAR: e, F_VAR = "x" } = process.env;',
    ].join("\n");
    expect(envNamesRead(source)).toEqual(["A_VAR", "B_VAR", "C_VAR", "D_VAR", "E_VAR", "F_VAR"]);
  });

  it.each(examples)("has a placeholder for every env var %s reads", (example) => {
    const missing = exampleEnvNames(example).filter((name) => !(name in EXAMPLE_ENV_PLACEHOLDERS));
    expect(missing, "add a placeholder for each to EXAMPLE_ENV_PLACEHOLDERS").toEqual([]);
  });

  it.each(examples)("loads %s", async (example) => {
    const path = repoPath(example);
    const { path: loadedPath, projection } = await loadAskDbConfigProjection(dirname(path));

    expect(loadedPath).toBe(path);
    expect(projection).toBeDefined();
    expect(() => defineConfig(projection!.config), example).not.toThrow();
    const loaded = JSON.stringify(projection!.config);
    for (const name of exampleEnvNames(example)) expect(loaded, name).toContain(EXAMPLE_ENV_PLACEHOLDERS[name]);
  });
});
