import { dirname } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineConfig, loadAskDbConfigProjection } from "./index.js";
import { EXAMPLE_ENV_PLACEHOLDERS, exampleEnvNames, repoPath, trackedExampleConfigs } from "./test-utils.js";

describe("example configurations, with no env values set", () => {
  beforeEach(() => {
    for (const name of Object.keys(EXAMPLE_ENV_PLACEHOLDERS)) vi.stubEnv(name, undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(trackedExampleConfigs())("loads %s", async (example) => {
    for (const name of exampleEnvNames(example)) expect(process.env[name], name).toBeUndefined();

    const { projection } = await loadAskDbConfigProjection(dirname(repoPath(example)));

    expect(projection).toBeDefined();
    expect(() => defineConfig(projection!.config), example).not.toThrow();
    const loaded = JSON.stringify(projection!.config);
    for (const value of Object.values(EXAMPLE_ENV_PLACEHOLDERS)) expect(loaded).not.toContain(value);
  });
});
