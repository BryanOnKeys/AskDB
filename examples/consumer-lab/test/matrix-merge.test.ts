/**
 * A sharded `pnpm lab:matrix --shard=<i>/<n>`, merged by `pnpm lab:matrix:merge`, gives the
 * matrix and the exit code one unsharded run gives.
 *
 * Protects: CI's sharded consumer lab. Each shard runs some of the suite's files on its own
 * machine and writes `.lab/matrix.shard-<i>.json`; the merge builds `matrix.json`, the table and
 * the step summary from every shard's, and its exit code is the job's verdict. The README
 * promises the merged matrix is the unsharded one, and that a shard that left no file fails the
 * merge.
 * Catches: a cell whose tests ran in different shards shown from one shard only (a `pass` that
 * hides the other shard's `FAIL`, or a `known` that loses an issue); a `FAIL` cell, or a shard
 * whose vitest run failed outside the matrix, that the merge passes; a crashed shard whose
 * cells silently go missing, so the merge passes on half the suite; and shards of different runs
 * merged into one matrix.
 * Not covered elsewhere: `matrix-reporter.test.ts` runs the reporter unsharded; nothing else
 * runs a shard or the merge.
 * No production seam: each case is real vitest runs of the lab's reporter and sequencer in a
 * scratch root (`test/support/scratch-matrix.ts`), sharded with vitest's own `--shard`, and the
 * merge script run on what they wrote.
 */
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readMatrix, runMerge, runVitest, scratchLab } from "./support/scratch-matrix.js";

/** Two files: the sequencer deals one to each of two shards (same weight; by path). */
const A = `
describe("[postgres]", () => { it("probe-pass: passes", () => { expect(1).toBe(1); }); });
describe("[mysql]", () => { it.fails("probe-known: a tracked bug (#1)", () => { expect(1).toBe(2); }); });
describe("[mariadb]", () => { it("probe-shared: from a", () => { expect(1).toBe(1); }); });
describe("tooling", () => { it("is outside the matrix", () => { expect(1).toBe(1); }); });
`;
const B = `
describe("[sqlite]", () => { it("probe-na: gated", (ctx) => { ctx.skip("capability: probe-capability"); }); });
describe("[mysql]", () => { it.fails("probe-known: another tracked bug (#2)", () => { expect(1).toBe(2); }); });
describe("[mariadb]", () => { it("probe-shared: from b", () => { expect(1).toBe(1); }); });
`;
const FAILING = `describe("[mariadb]", () => { it("probe-shared: fails in b", () => { expect(41, "rows for agency 2").toBe(42); }); });`;

/** The same files run unsharded and as two shards, and the shards merged. */
function sharded(files: Record<string, string>) {
  const whole = scratchLab(files);
  const unsharded = { ...runVitest(whole), ...readMatrix(whole) };
  const dir = scratchLab(files);
  const shards = [1, 2].map((i) => runVitest(dir, [`--shard=${i}/2`], join(dir, `shard-${i}-summary.md`)));
  return { dir, unsharded, shards, merge: () => runMerge(dir) };
}

const cells = (json: ReturnType<typeof readMatrix>["json"]) =>
  Object.fromEntries(json.rows.flatMap((r) => Object.entries(r.cells).map(([d, c]) => [`${r.scenario} [${d}]`, c.text])));
/** `matrix.json` without what differs between any two runs: when it was written, and how long files took. */
const stable = ({ generatedAt: _at, files: _files, ...rest }: ReturnType<typeof readMatrix>["json"] & { generatedAt?: string }) => rest;

describe("lab:matrix:merge", () => {
  it("merges two shards into the unsharded matrix, a cell split across them included, and passes", () => {
    const { dir, unsharded, shards, merge } = sharded({ "a.test.ts": A, "b.test.ts": B });
    expect(shards.map((s) => s.status)).toEqual([0, 0]);
    // Each shard ran one file, wrote its own file, and no matrix.json.
    expect(existsSync(join(dir, ".lab", "matrix.json"))).toBe(false);
    expect(shards[0]!.out).toContain("Consumer lab matrix, shard 1/2");

    const run = merge();
    const merged = readMatrix(dir, join(dir, "merge-summary.md"));

    expect(run.status, run.out).toBe(0);
    expect(cells(merged.json)).toEqual({
      "probe-pass [postgres]": "pass",
      "probe-known [mysql]": "known (#1, #2)",
      "probe-shared [mariadb]": "pass",
      "probe-na [sqlite]": "n/a (capability: probe-capability)",
    });
    expect(stable(merged.json)).toEqual(stable(unsharded.json));
    expect(Object.keys(merged.json.files).sort()).toEqual(["test/a.test.ts", "test/b.test.ts"]);
    expect(merged.summary).toBe(unsharded.summary);
    expect(unsharded.status, unsharded.out).toBe(0);
  });

  it("fails on a FAIL cell from one shard, even where the other shard's tests in that cell passed", () => {
    const { dir, unsharded, shards, merge } = sharded({ "a.test.ts": A, "b.test.ts": `${B}\n${FAILING}` });
    expect(shards.map((s) => s.status)).toEqual([0, 1]);

    const run = merge();
    const merged = readMatrix(dir, join(dir, "merge-summary.md"));

    expect(cells(merged.json)["probe-shared [mariadb]"]).toBe("FAIL");
    expect(merged.json.rows.find((r) => r.scenario === "probe-shared")?.cells.mariadb?.failures).toEqual([
      { test: "[mariadb] > probe-shared: fails in b", reason: expect.stringContaining("rows for agency 2: expected 41 to be 42") },
    ]);
    expect(merged.summary).toContain("1 FAIL cell(s):** probe-shared [mariadb]");
    expect(stable(merged.json)).toEqual(stable(unsharded.json));
    expect(run.status, run.out).toBe(1);
    expect(unsharded.status).toBe(1);
  });

  it("fails when a shard's vitest run failed outside the matrix, with no FAIL cell", () => {
    const outside = `describe("tooling", () => { it("fails outside the matrix", () => { expect(1).toBe(2); }); });`;
    const { dir, shards, merge } = sharded({ "a.test.ts": A, "b.test.ts": `${B}\n${outside}` });
    expect(shards.map((s) => s.status)).toEqual([0, 1]);

    const run = merge();

    expect(Object.values(cells(readMatrix(dir).json))).not.toContain("FAIL");
    expect(run.out).toContain("shard 2/2: vitest reported a failed run");
    expect(run.status, run.out).toBe(1);
  });

  it("refuses to merge, writing no matrix, when a shard left no file", () => {
    const { dir, merge } = sharded({ "a.test.ts": A, "b.test.ts": B });
    rmSync(join(dir, ".lab", "matrix.shard-2.json"));

    const run = merge();

    expect(run.out).toMatch(/shard 2\/2 is missing/);
    expect(existsSync(join(dir, ".lab", "matrix.json"))).toBe(false);
    expect(run.status, run.out).toBe(2);
  });

  it("refuses shards of different runs", () => {
    const { dir } = sharded({ "a.test.ts": A, "b.test.ts": B });
    const other = scratchLab({ "a.test.ts": A, "b.test.ts": B, "c.test.ts": B });
    runVitest(other, ["--shard=1/3"]);

    const run = runMerge(dir, [join(dir, ".lab", "matrix.shard-1.json"), join(dir, ".lab", "matrix.shard-2.json"), join(other, ".lab", "matrix.shard-1.json")]);

    expect(run.out).toContain("different numbers of shards");
    expect(run.status, run.out).toBe(2);
  });
});
