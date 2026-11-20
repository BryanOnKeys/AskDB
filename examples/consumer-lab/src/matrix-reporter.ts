/**
 * Vitest reporter for `pnpm lab:matrix`: a `scenario × dialect` table built from test
 * results, printed and written to `.lab/matrix.json` (and appended to
 * `$GITHUB_STEP_SUMMARY` when set). `src/matrix-table.mjs` builds the table and says what
 * each cell value means; this reads each test's outcome from vitest.
 *
 * A test's outcome: `fail` if it failed (an `it.fails` test whose bug is fixed fails too);
 * `known` if it is an `it.fails` case naming issue `#N` that failed as expected; `miss` if it
 * passed but annotated a live-model miss with `ctx.annotate("<reason>", "miss")`
 * (`test/live.test.ts`): the model's answer was wrong, which is model quality, not a product
 * failure; `pass` if it passed; `na` if it was skipped with `ctx.skip("capability: …")`.
 *
 * Any `FAIL` cell fails the run (exit code 1), even one vitest counts as passing: an
 * `it.fails` test that names no issue, or a skip that isn't a capability gate. CI's
 * consumer-lab job relies on this; `pass`, `n/a`, `known` and `miss` cells don't fail it.
 *
 * Each `FAIL` cell records why each of its tests failed (the error, or the rule that made a
 * passing test a failure), in `matrix.json` and in the step summary, so CI shows the reason
 * next to the table. Errors outside any test (unhandled errors) are listed too.
 *
 * A sharded run (`vitest run --shard=<i>/<n>`) holds only some of the suite's files, so it
 * writes no `matrix.json` and no step summary. It prints its own cells, writes its outcomes to
 * `.lab/matrix.shard-<i>.json`, and still exits 1 on a `FAIL` cell, which no other shard can
 * clear. `src/matrix-merge.mjs` (`pnpm lab:matrix:merge`) combines every shard's file into the
 * matrix one unsharded run writes.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { LAB_ROOT, LAB_STATE } from "./paths.js";
import type { Reporter, SerializedError, TestCase, TestModule, TestRunEndReason, Vitest } from "vitest/node";
import { DIALECTS } from "./fixture.js";
import { renderMatrix, SHARD_FORMAT, shardFile, type MatrixRun, type MatrixShard, type Outcome } from "./matrix-table.mjs";

const ISSUE = /\(#(\d+)\)/g;

/** The annotation type a live-model test gives a miss (`ctx.annotate(reason, "miss")`). */
const MISS = "miss";

const MAX_REASON_LINES = 30;
const MAX_REASON_CHARS = 3000;
const ANSI = /\u001b\[[0-9;]*m/g;

/** An error's name, message and diff, without colors, cut to a readable length. */
function errorText(errors: ReadonlyArray<SerializedError & { diff?: string }>): string | undefined {
  if (!errors.length) return undefined;
  const text = errors
    .map((e) => [`${e.name && !e.message.startsWith(e.name) ? `${e.name}: ` : ""}${e.message}`, e.diff].filter(Boolean).join("\n"))
    .join("\n\n")
    .replace(ANSI, "");
  const lines = text.split("\n");
  let out = lines.slice(0, MAX_REASON_LINES).join("\n");
  if (out.length > MAX_REASON_CHARS) out = out.slice(0, MAX_REASON_CHARS);
  return out.length < text.length ? `${out}\n… (cut; the full error is in the step log)` : out;
}

function outcomeOf(test: TestCase): Outcome {
  const result = test.result();
  if (result.state === "failed") {
    return { status: "fail", reason: errorText(result.errors) ?? "failed with no error message" };
  }
  if (result.state === "passed") {
    if (!test.options.fails) {
      const misses = test.annotations().filter((a) => a.type === MISS).map((a) => a.message);
      return misses.length ? { status: "miss", detail: misses.join("; ") } : { status: "pass" };
    }
    const issues = [...test.name.matchAll(ISSUE)].map((m) => `#${m[1]}`);
    // An expected failure that names no issue isn't tracked anywhere: show it as a failure.
    return issues.length
      ? { status: "known", detail: issues.join(", ") }
      : { status: "fail", reason: "`it.fails` test that names no issue: add the tracking issue as `(#N)` to its name." };
  }
  // Only a capability gate (src/capabilities.ts) may skip a test that was meant to run: the
  // lab fails rather than skips. Any other skip note is a failure.
  if (result.state === "skipped" && result.note) {
    return result.note.startsWith("capability:")
      ? { status: "na", detail: result.note }
      : { status: "fail", detail: `skipped: ${result.note}`, reason: `skipped with a note that isn't a capability gate: ${result.note}` };
  }
  // Filtered out (`-t`, `.skip`, `.todo`): the test never ran, whatever its siblings did.
  if (test.options.mode !== "run" && test.options.mode !== "only") return { status: "not-run" };
  // Meant to run, but skipped because a hook or its suite failed: a failure, not an absence.
  for (let p = test.parent; p.type !== "module"; p = p.parent) {
    if (p.state() === "failed") {
      return { status: "fail", reason: `not run: its suite "${p.fullName}" failed\n${errorText(p.errors()) ?? "(a hook in the suite failed)"}` };
    }
  }
  if (test.module.state() === "failed") {
    return { status: "fail", reason: `not run: its test file failed\n${errorText(test.module.errors()) ?? "(see the step log)"}` };
  }
  return { status: "not-run" };
}

function installTarget(): string | undefined {
  const file = join(LAB_STATE, "target.json");
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { label?: string }).label : undefined;
}

/** A test file's path from the lab's root, with `/` separators, so shards' files compare across machines. */
const labPath = (moduleId: string) => relative(LAB_ROOT, moduleId).split(sep).join("/");

export default class MatrixReporter implements Reporter {
  private shard: { index: number; count: number } | undefined;

  onInit(vitest: Vitest): void {
    this.shard = vitest.config.shard;
  }

  onTestRunEnd(testModules: ReadonlyArray<TestModule>, unhandledErrors: ReadonlyArray<SerializedError>, reason: TestRunEndReason): void {
    const modules = [...testModules].sort((a, b) => a.moduleId.localeCompare(b.moduleId));
    const run: MatrixRun = {
      target: installTarget(),
      dialects: [...DIALECTS],
      tests: modules.flatMap((m) => [...m.children.allTests()].map((test) => ({ file: labPath(m.moduleId), name: test.fullName, outcome: outcomeOf(test) }))),
      unhandledErrors: unhandledErrors.map((e) => errorText([e]) ?? "unhandled error with no message"),
      files: Object.fromEntries(modules.map((m) => [labPath(m.moduleId), Math.round(m.diagnostic().duration / 100) / 10])),
      vitest: reason,
    };
    mkdirSync(LAB_STATE, { recursive: true });

    if (this.shard) {
      const { index, count } = this.shard;
      const file = shardFile(LAB_STATE, index);
      const { text, failed } = renderMatrix(run, {
        title: `Consumer lab matrix, shard ${index}/${count}`,
        notes: [`This shard's cells only. \`pnpm lab:matrix:merge\` combines every shard's into the matrix; this shard's outcomes are in ${relative(LAB_ROOT, file)}.`],
      });
      console.log(text);
      const shard: MatrixShard = { format: SHARD_FORMAT, shard: { index, count }, generatedAt: new Date().toISOString(), ...run };
      writeFileSync(file, `${JSON.stringify(shard, null, 2)}\n`);
      // A FAIL cell stays FAIL whatever the other shards hold.
      if (failed.length) process.exitCode = 1;
      return;
    }

    const { text, json, summary, failed } = renderMatrix(run);
    console.log(text);
    writeFileSync(join(LAB_STATE, "matrix.json"), `${JSON.stringify(json, null, 2)}\n`);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
    // Vitest only ever raises the exit code, so this sticks; it never masks vitest's own failures.
    if (failed.length) process.exitCode = 1;
  }
}
