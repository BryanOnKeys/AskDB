/**
 * `pnpm lab ui`'s input checks: the page and `pnpm lab ask` run exactly the input they were
 * given, driven over HTTP the way the page drives it (`POST /api/run`, read back as NDJSON).
 *
 * `lab ui`'s scenarios are split over the `lab-ui-*.test.ts` files, so vitest runs them on
 * different workers; what they share is in `support/lab-ui.ts`. No production seam: the tests
 * start the real `pnpm lab ui` command (through tsx's loader, as `pnpm lab` does) and the real
 * `pnpm lab ask`, and send the requests the page sends. The `lab ui` here starts without a key
 * (`support/lab-ui.ts`), so it can't ask the live model.
 *
 * The scenario doesn't depend on an engine and runs once, as `[postgres]`.
 *
 * Needs the `cli-introspect-engine` capability (every column builds a schema artifact), the
 * fixture (`pnpm fixture:up`) and an installed lab (`pnpm lab:use .`).
 */
import { afterAll, beforeAll, expect, it } from "vitest";
import { needsCapability } from "../src/capabilities.js";
import type { UiInput } from "../src/ui/server.js";
import { AGENCY_NAMES, lab, startLabUiProcess, uiRun, type LabUiProcess } from "./support/lab-ui.js";

let ui: LabUiProcess;

beforeAll(async () => {
  ui = await startLabUiProcess();
});

afterAll(async () => {
  await ui?.close();
});

/*
 * Protects: the page and `lab ask` run exactly the input they were given (issues #262, #448).
 * Blank SQL is refused (`400` from the page, usage and exit 2 from `lab ask --sql ""`), not run
 * as the question it's labelled with; so are a model, a path or an engine the server doesn't
 * know, no engine at all, and SQL sent for the live model, which SQL doesn't call. Only the
 * engines picked run, and the summary compares only them.
 * Catches: blank SQL silently dropped, so the label's replay question runs instead and rows
 * appear for SQL nobody wrote; an unknown model or path quietly replaced by the default, so a
 * contributor reads replay or raw-path results as the ones they picked; and engines left out
 * of the pick that run anyway.
 * Not covered elsewhere: the other runs all send valid input, on every engine.
 */
it.for([
  ["blank SQL", { question: AGENCY_NAMES, sql: "   " }],
  ["an unknown model", { question: AGENCY_NAMES, model: "gpt-4o" }],
  ["an unknown path", { question: AGENCY_NAMES, via: "http" }],
  ["an unknown engine", { question: AGENCY_NAMES, engines: ["sqlite", "oracle"] }],
  ["no engine", { question: AGENCY_NAMES, engines: [] }],
  ["SQL for the live model", { question: AGENCY_NAMES, sql: "SELECT 1", model: "live" }],
] as const)("[postgres] lab-ui-input: refuses %s", async ([, input]) => {
  const run = await uiRun(ui, input as unknown as UiInput);

  expect(run.status).toBe(400);
});

it("[postgres] lab-ui-input: runs only the engines picked, and compares only them", async (ctx) => {
  needsCapability(ctx, "cli-introspect-engine");
  const run = await uiRun(ui, { question: AGENCY_NAMES, engines: ["sqlite", "mariadb"] });

  expect(run.engines.map((e) => e.dialect).sort()).toEqual(["mariadb", "sqlite"]);
  expect(run.summary?.agreement.verdict).toBe("agree");
  expect(Object.keys(run.summary?.oracle ?? {}).sort()).toEqual(["mariadb", "sqlite"]);
});

it("[postgres] lab-ui-input: lab ask refuses a blank --sql, as the page does", async () => {
  const run = await lab(["ask", "--db", "postgres", "--sql", "", AGENCY_NAMES]);

  expect(run.status).toBe(2);
  expect(run.stderr).toContain("usage: pnpm lab");
  expect(run.stdout).toBe("");
});
