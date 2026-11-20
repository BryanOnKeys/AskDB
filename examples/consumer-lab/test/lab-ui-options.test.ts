/**
 * `pnpm lab ui`'s command-line options: the ones it refuses, and the longest `--timeout` it
 * accepts.
 *
 * `lab ui`'s scenarios are split over the `lab-ui-*.test.ts` files, so vitest runs them on
 * different workers; what they share is in `support/lab-ui.ts`. No production seam: the tests
 * run the real `pnpm lab ui` command (through tsx's loader, as `pnpm lab` does) with the options
 * a contributor might type. The `lab ui` the last test starts has no key (`support/lab-ui.ts`),
 * so it can't ask the live model.
 *
 * The scenario doesn't depend on an engine and runs once, as `[postgres]`.
 *
 * Needs an installed lab (`pnpm lab:use .`).
 */
import { expect, it } from "vitest";
import { studioRequest } from "../src/studio.js";
import { lab, startLabUiProcess } from "./support/lab-ui.js";

/*
 * Protects: `lab ui` refuses an option it can't honor, printing its usage and exiting 2: a
 * blank `--port` or one outside 0–65535, a `--timeout` longer than Node's timer limit, an
 * option with no value, an unknown option and an extra argument.
 * Catches: a blank `--port` quietly read as 0 (a random port), a port the bind then crashes
 * on, a `--timeout` Node cuts to 1 ms, so every engine times out at once, and a parse error
 * that escapes as a stack trace.
 * Not covered elsewhere: every other test starts `lab ui` with valid options. The longest
 * timeout Node can hold starts the server; one millisecond more is refused.
 */
it.for([
  ["a blank --port", ["--port", ""]],
  ["--port 65536", ["--port", "65536"]],
  ["a --timeout beyond Node's timer limit", ["--timeout", String(2 ** 31)]],
  ["--port with no value", ["--port"]],
  ["an unknown option", ["--verbose"]],
  ["an extra argument", ["extra"]],
] as const)("[postgres] lab-ui-options: refuses %s", async ([, args]) => {
  // A refused option exits within seconds; a server that starts instead is killed before the test times out.
  const run = await lab(["ui", ...args], 90_000);

  expect(run.status).toBe(2);
  expect(run.stderr).toContain("pnpm lab ui [--port <port>] [--timeout <ms>]");
});

it("[postgres] lab-ui-options: accepts the longest --timeout Node can hold", async () => {
  const longest = await startLabUiProcess({ args: ["--timeout", String(2 ** 31 - 1)] });
  try {
    expect((await studioRequest(longest)).status).toBe(200);
  } finally {
    await longest.close();
  }
});
