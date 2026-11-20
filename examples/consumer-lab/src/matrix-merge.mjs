#!/usr/bin/env node
/**
 * Merges the shards of a sharded `pnpm lab:matrix` into the matrix one unsharded run writes:
 * `pnpm lab:matrix:merge`.
 *
 *   node examples/consumer-lab/src/matrix-merge.mjs [<shard file or directory>…]
 *
 * Each shard (`pnpm lab:matrix --shard=<i>/<n>`, usually on its own machine with its own
 * fixture) writes its tests' outcomes to `.lab/matrix.shard-<i>.json`. This reads shard files,
 * and every `matrix.shard-<i>.json` under a directory given (default: the lab's `.lab/`), then
 * builds the matrix from all of them with the reporter's code (`src/matrix-table.mjs`): it prints
 * the same table, writes the same `.lab/matrix.json` and, when `$GITHUB_STEP_SUMMARY` is set,
 * appends the same summary.
 *
 * Exits like `lab:matrix` would have on the whole suite: 1 when a cell is `FAIL`, or when a
 * shard's vitest run failed or was interrupted (a failing test outside the matrix, a file that
 * didn't load, an unhandled error), else 0. Exits 2, writing nothing, unless the files are
 * exactly shards 1 to N of one run: a shard that crashed before writing its file, or whose file
 * wasn't downloaded, fails the merge rather than leaving its cells out.
 *
 * Dependency-free, like `matrix-cells.mjs`, so it runs where only the shard files are.
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mergeShards, renderMatrix, ShardMergeError } from "./matrix-table.mjs";

const LAB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STATE = join(LAB, ".lab");
const SHARD_NAME = /^matrix\.shard-\d+\.json$/;
/** Why vitest fails a shard's run: a FAIL cell's test, or a failure outside the matrix. */
const UNFINISHED = "Vitest failed these shards' runs (a FAIL cell's test, or a test outside the matrix, a file that didn't load or an unhandled error)";
const USAGE = "usage: node examples/consumer-lab/src/matrix-merge.mjs [<shard file or directory>…]";

/** @param {string} message */
function refuse(message) {
  console.error(`matrix-merge: ${message}`);
  process.exit(2);
}

/**
 * Every shard file under `dir`, at any depth: a CI job that downloads each shard's artifact gets
 * one directory per artifact.
 * @param {string} dir
 * @returns {string[]}
 */
function shardFilesIn(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return shardFilesIn(path);
    return entry.isFile() && SHARD_NAME.test(entry.name) ? [path] : [];
  });
}

const args = process.argv.slice(2);
if (args.some((a) => a.startsWith("-"))) refuse(USAGE);
const files = (args.length ? args : [STATE]).flatMap((arg) => {
  const path = resolve(arg);
  if (!existsSync(path)) return refuse(`${arg} doesn't exist`);
  if (!statSync(path).isDirectory()) return [path];
  const found = shardFilesIn(path);
  if (!found.length) refuse(`no matrix.shard-<i>.json under ${arg}: did every shard's run end, and was its file downloaded?`);
  return found;
});

const inputs = [...new Set(files)].map((file) => {
  try {
    return { file: relative(process.cwd(), file) || file, shard: JSON.parse(readFileSync(file, "utf8")) };
  } catch (error) {
    return refuse(`${file} isn't JSON: ${/** @type {Error} */ (error).message}`);
  }
});

let merged;
try {
  merged = mergeShards(inputs);
} catch (error) {
  if (!(error instanceof ShardMergeError)) throw error;
  refuse(`can't merge the shards, so there is no matrix:\n${error.problems.map((p) => `  ${p}`).join("\n")}`);
}
const { run, count, unfinished } = /** @type {NonNullable<typeof merged>} */ (merged);

const { text, json, summary, failed } = renderMatrix(run, {
  notes: [`Merged from ${count} shard(s): ${inputs.map((i) => i.file).sort().join(", ")}`],
  unhandledWhere: "the shards' output",
});
const lines = [text];
if (unfinished.length) lines.push("", `${UNFINISHED}; the reason is in each shard's output:`, ...unfinished.map((u) => `  ${u}`));
console.log(lines.join("\n"));

mkdirSync(STATE, { recursive: true });
writeFileSync(join(STATE, "matrix.json"), `${JSON.stringify(json, null, 2)}\n`);
if (process.env.GITHUB_STEP_SUMMARY) {
  const outside = unfinished.length ? `**${UNFINISHED}**; the reason is in each shard's step log:\n\n${unfinished.map((u) => `- ${u}`).join("\n")}\n\n` : "";
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}${outside}`);
}
process.exitCode = failed.length || unfinished.length ? 1 : 0;
