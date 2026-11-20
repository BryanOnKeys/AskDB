/**
 * `src/matrix-shards.ts` deals the lab's test files out to `--shard=<i>/<n>` by what each costs.
 *
 * Protects: CI's sharded consumer lab finishing when its slowest shard does, so the shards must
 * split the suite's time, not its file count, and between them run every file exactly once.
 * Catches: a shard that misses a file or runs one another shard runs (the merge would refuse,
 * or a cell would go missing), a deal that differs between machines, and a weight left behind
 * for a test file that was renamed or removed, so the deal balances on files that don't exist.
 * Not covered elsewhere: `matrix-merge.test.ts` shards two equal files, which any split balances.
 * No production seam: `assignShards` is what the sequencer calls with the run's file list.
 */
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { assignShards, DEFAULT_SECONDS, FILE_SECONDS } from "../src/matrix-shards.js";
import { LAB_ROOT } from "../src/paths.js";

/** Every `*.test.ts` under `test/`, as the sequencer names them. */
function testFiles(dir = join(LAB_ROOT, "test")): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return testFiles(path);
    return e.name.endsWith(".test.ts") ? [relative(LAB_ROOT, path).split(sep).join("/")] : [];
  });
}

const seconds = (files: string[]) => files.reduce((sum, f) => sum + (FILE_SECONDS[f] ?? DEFAULT_SECONDS), 0);

describe("matrix shards", () => {
  it("weighs only test files that exist", () => {
    const files = new Set(testFiles());

    expect(Object.keys(FILE_SECONDS).filter((f) => !files.has(f))).toEqual([]);
  });

  it.for([2, 3, 4])("deals every test file to exactly one of %i shards, the same way whatever order they come in", (count) => {
    const files = testFiles();
    const shards = assignShards(files, count);

    expect(shards.flat().sort()).toEqual([...files].sort());
    expect(assignShards([...files].reverse(), count)).toEqual(shards);
  });

  it("splits the suite's time between two shards to within its heaviest file", () => {
    const shards = assignShards(testFiles(), 2).map(seconds);
    const heaviest = Math.max(...Object.values(FILE_SECONDS));

    expect(Math.abs(shards[0]! - shards[1]!)).toBeLessThanOrEqual(heaviest);
  });

  it("deals heaviest first, each to the lightest shard so far", () => {
    // Weights are FILE_SECONDS's, or DEFAULT_SECONDS for these made-up names.
    expect(assignShards(["test/lab-ask-replay-sqlserver.test.ts", "test/lab-ui-compare.test.ts", "test/x.test.ts", "test/y.test.ts"], 2)).toEqual([
      ["test/lab-ui-compare.test.ts"],
      ["test/lab-ask-replay-sqlserver.test.ts", "test/x.test.ts", "test/y.test.ts"],
    ]);
  });
});
