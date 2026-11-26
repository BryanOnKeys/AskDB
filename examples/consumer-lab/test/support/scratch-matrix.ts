/**
 * Runs probe test files under the lab's real matrix reporter in a scratch root, so tests of
 * the reporter, of the shard merge, and of what reads their `matrix.json`, never touch the
 * lab's own `.lab/`.
 *
 * The scratch root holds the lab's `src/matrix-reporter.ts`, `src/matrix-table.mjs`,
 * `src/matrix-merge.mjs`, `src/matrix-shards.ts`, `src/paths.ts` and `src/fixture.ts`, copied
 * verbatim (the last with its fixture path made absolute), a `vitest.config.ts` that sets the
 * lab's sequencer, as the lab's does, and a symlink to the lab's `node_modules`.
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll } from "vitest";

export const LAB = fileURLToPath(new URL("../..", import.meta.url));
const FIXTURE_INDEX = fileURLToPath(new URL("../../../../fixtures/multi-engine/src/index.js", import.meta.url));
const COPIED = ["matrix-reporter.ts", "matrix-table.mjs", "matrix-merge.mjs", "matrix-shards.ts", "paths.ts"];
const scratch: string[] = [];
afterAll(() => scratch.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

export interface MatrixJson {
  rows: { scenario: string; cells: Record<string, { text: string; failures?: { test: string; reason: string }[] }> }[];
  unmatched: string[];
  unhandledErrors: string[];
  files: Record<string, number>;
}

/** A scratch lab whose `test/` holds `files` (name → a test file's describe blocks). */
export function scratchLab(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "lab-matrix-"));
  scratch.push(dir);
  mkdirSync(join(dir, "src"));
  mkdirSync(join(dir, "test"));
  for (const file of COPIED) cpSync(join(LAB, "src", file), join(dir, "src", file));
  const fixture = readFileSync(join(LAB, "src", "fixture.ts"), "utf8").replace("../../../fixtures/multi-engine/src/index.js", FIXTURE_INDEX);
  writeFileSync(join(dir, "src", "fixture.ts"), fixture);
  writeFileSync(
    join(dir, "vitest.config.ts"),
    `import { defineConfig } from "vitest/config";\nimport { MatrixSequencer } from "./src/matrix-shards.js";\nexport default defineConfig({ test: { sequence: { sequencer: MatrixSequencer } } });\n`,
  );
  symlinkSync(join(LAB, "node_modules"), join(dir, "node_modules"), "dir");
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(dir, "test", name), `import { describe, expect, it } from "vitest";\n${body}\n`);
  }
  return dir;
}

/** `vitest run` under the matrix reporter in a scratch lab, with `args` added and `summary` as the step summary. */
export function runVitest(dir: string, args: string[] = [], summary = join(dir, "summary.md")) {
  const run = spawnSync(
    process.execPath,
    [join(LAB, "node_modules", "vitest", "vitest.mjs"), "run", "--root", dir, "--reporter=default", "--reporter=./src/matrix-reporter.ts", ...args],
    { cwd: dir, encoding: "utf8", env: { ...process.env, GITHUB_STEP_SUMMARY: summary } },
  );
  return { status: run.status, out: `${run.stdout}\n${run.stderr}` };
}

/** The scratch lab's `matrix.json`, and the step summary written to `summary`. */
export function readMatrix(dir: string, summary = join(dir, "summary.md")) {
  const file = join(dir, ".lab", "matrix.json");
  return {
    file,
    json: JSON.parse(readFileSync(file, "utf8")) as MatrixJson,
    summary: existsSync(summary) ? readFileSync(summary, "utf8") : "",
  };
}

/**
 * Run `body` (a test file's describe blocks) under the matrix reporter, with `args` added to
 * vitest's. Returns the run's exit status and output, the `matrix.json` it wrote and that file's
 * path, and the step summary.
 */
export function runMatrix(body: string, args: string[] = []) {
  const dir = scratchLab({ "probe.test.ts": body });
  return { ...runVitest(dir, args), ...readMatrix(dir) };
}

/** `node src/matrix-merge.mjs <args>` in a scratch lab, with `summary` as the step summary. */
export function runMerge(dir: string, args: string[] = [], summary = join(dir, "merge-summary.md")) {
  const run = spawnSync(process.execPath, [join(dir, "src", "matrix-merge.mjs"), ...args], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, GITHUB_STEP_SUMMARY: summary },
  });
  return { status: run.status, out: `${run.stdout}\n${run.stderr}` };
}
