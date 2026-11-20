/**
 * Which test files a shard of `pnpm lab:matrix --shard=<i>/<n>` runs, and the order every run
 * starts its files in: by how long each file takes, not by name.
 *
 * Vitest's own sharding sorts the files by a hash of their paths and gives each shard the same
 * number of files, whatever they cost. The lab's files range from under a second to minutes, so a
 * shard could get most of the slow ones. Here each file weighs the seconds it took in CI
 * (`FILE_SECONDS`), and the files are dealt out heaviest first, each to the shard with the least
 * weight so far (longest-processing-time first). Every shard computes the same deal from the same
 * file list, so the shards never overlap and never miss a file.
 *
 * Within a run (a shard, or the whole suite), files start heaviest first, so the longest ones
 * aren't left for the end while the other workers sit idle.
 */
import { relative, sep } from "node:path";
import { BaseSequencer, type TestSpecification } from "vitest/node";

/**
 * Seconds each test file took in CI's `consumer-lab` job (ubuntu-latest, 4 vCPU, 3 vitest
 * workers), with its `/`-separated path from the lab's root. `matrix.json`'s `files` holds the
 * same numbers from a run: refresh these from a recent `main` run's `consumer-lab-matrix`
 * artifact when a file is added or its cost moves. A file not listed weighs `DEFAULT_SECONDS`.
 *
 * Measured in PR #1074's sharded run (two shards, each on its own runner), rounded, at least 1.
 */
export const FILE_SECONDS: Readonly<Record<string, number>> = {
  "test/lab-ui-compare.test.ts": 88,
  "test/lab-ask-replay-sqlserver.test.ts": 55,
  "test/lab-ask-replay-mysql.test.ts": 47,
  "test/lab-ask-replay-sqlite.test.ts": 42,
  "test/lab-ui-isolation.test.ts": 42,
  "test/lab-ask-replay-mariadb.test.ts": 40,
  "test/surfaces/cli.test.ts": 34,
  "test/matrix-merge.test.ts": 33,
  "test/lab-ask-replay-postgres.test.ts": 32,
  "test/use-restore.test.ts": 26,
  "test/safety.test.ts": 24,
  "test/lab-ui-options.test.ts": 21,
  "test/lab-ask-live.test.ts": 19,
  "test/tenant.test.ts": 19,
  "test/surfaces/askdb-no-prisma.test.ts": 15,
  "test/lab-ask.test.ts": 14,
  "test/surfaces/studio.test.ts": 12,
  "test/matrix-reporter.test.ts": 10,
  "test/lab-ui-live.test.ts": 9,
  "test/record.test.ts": 8,
  "test/sensitive.test.ts": 6,
  "test/surfaces/http-api.test.ts": 6,
  "test/introspection.test.ts": 5,
  "test/lab-ui-input.test.ts": 5,
  "test/host-execute.test.ts": 3,
  "test/results.test.ts": 3,
  "test/grade.test.ts": 2,
  "test/host-peers.test.ts": 2,
  "test/lab-ui-page.test.ts": 2,
  "test/published-run.test.ts": 2,
  "test/surfaces/http-api-no-pg.test.ts": 2,
  "test/tenant-rls.test.ts": 2,
  "test/cassette-sql.test.ts": 1,
  "test/isolated-fixture.test.ts": 1,
  "test/live.test.ts": 1,
  "test/matrix-cells.test.ts": 1,
  "test/matrix-shards.test.ts": 1,
  "test/replay-server.test.ts": 1,
  "test/studio-page-token.test.ts": 1,
  "test/use-if-needed.test.ts": 1,
  "test/use-npm-release.test.ts": 1,
  "test/use.test.ts": 1,
};

/** The weight of a file `FILE_SECONDS` doesn't list yet: a scenario on every engine takes about this long. */
export const DEFAULT_SECONDS = 10;

const weight = (file: string) => FILE_SECONDS[file] ?? DEFAULT_SECONDS;

/** Heaviest first; ties by path, so every machine orders them the same. */
const heaviestFirst = (a: string, b: string) => weight(b) - weight(a) || (a < b ? -1 : a > b ? 1 : 0);

/**
 * `files` dealt into `count` shards: heaviest first, each to the lightest shard so far (the
 * lowest-numbered on a tie). Shard `i` (from 1) is element `i - 1`.
 */
export function assignShards(files: readonly string[], count: number): string[][] {
  const shards = Array.from({ length: count }, () => ({ files: [] as string[], seconds: 0 }));
  for (const file of [...files].sort(heaviestFirst)) {
    const lightest = shards.reduce((min, s) => (s.seconds < min.seconds ? s : min));
    lightest.files.push(file);
    lightest.seconds += weight(file);
  }
  return shards.map((s) => s.files);
}

/** The lab's sequencer (`vitest.config.ts`): shards by weight, and starts each run's files heaviest first. */
export class MatrixSequencer extends BaseSequencer {
  private labPath(spec: TestSpecification): string {
    return relative(this.ctx.config.root, spec.moduleId).split(sep).join("/");
  }

  override async shard(files: TestSpecification[]): Promise<TestSpecification[]> {
    const { index, count } = this.ctx.config.shard!;
    const mine = new Set(assignShards(files.map((f) => this.labPath(f)), count)[index - 1]);
    return files.filter((f) => mine.has(this.labPath(f)));
  }

  override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    return [...files].sort((a, b) => heaviestFirst(this.labPath(a), this.labPath(b)));
  }
}
