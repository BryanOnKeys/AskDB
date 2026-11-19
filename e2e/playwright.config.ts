import { defineConfig, devices } from "@playwright/test";

// Studio's UI replays. global-setup.ts makes one run, introspects shop.db and starts Studio;
// global-teardown.ts cleans it up. Retries stay off: a replay that needs one is a flaky replay.
export default defineConfig({
  testDir: "studio",
  testMatch: "**/*.spec.ts",
  globalSetup: "./studio/global-setup.ts",
  globalTeardown: "./studio/global-teardown.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  // A missing control fails in 10 s instead of the 30 s test timeout.
  expect: { timeout: 10_000 },
  use: {
    actionTimeout: 10_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1280, height: 800 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } }],
});
