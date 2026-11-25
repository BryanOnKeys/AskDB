/**
 * The `scenario × dialect` table of `pnpm lab:matrix`, built from a run's test outcomes:
 * the cells, the printed table, `matrix.json` and the step summary. The matrix reporter
 * (`src/matrix-reporter.ts`) collects a run's outcomes from vitest and renders them here; a
 * sharded run's reporter writes them to a shard file instead, and `src/matrix-merge.mjs`
 * renders every shard's together, so a merged matrix is built by the same code as one run's.
 *
 * A test joins the matrix through its full name (describe blocks + test name):
 * `[<dialect>] <scenario-id>…`, for example `describe("[mysql]")` around
 * `it("introspect-golden: …")`. Several tests may share a cell. A cell is:
 *
 * - `FAIL` if any of its tests failed (an `it.fails` test whose bug is fixed fails too);
 * - `known (#N)` if its tests are `it.fails` cases naming issue `#N` that failed as expected;
 * - `miss (reason; …)` if its tests passed but annotated a live-model miss;
 * - `pass` if its tests passed;
 * - `n/a (reason)` if its tests were skipped by a capability gate;
 * - `-` if no test ran for it (none exists, or a filter excluded it).
 *
 * After the test rows come annotation rows, marked `*`: facts the golden schema holds but
 * the schema artifact can't express, so no test can compare them. They are a static list, not
 * test results; see {@link ARTIFACT_LIMITS}.
 *
 * Dependency-free, like `matrix-cells.mjs`, so the merge runs on a machine with no install.
 */
import { join } from "node:path";

/**
 * @typedef {"pass" | "fail" | "known" | "miss" | "na"} Status
 *
 * @typedef {object} Outcome One test's result, as the reporter reads it from vitest.
 * @property {Status | "not-run"} status
 * @property {string} [detail] The issues (`known`), the capability (`na`) or the misses (`miss`).
 * @property {string} [reason] Why a `fail` outcome failed.
 *
 * @typedef {object} TestOutcome
 * @property {string} file The test file, relative to the lab's root, with `/` separators.
 * @property {string} name The test's full name: describe blocks and test name.
 * @property {Outcome} outcome
 *
 * @typedef {object} MatrixRun What a run of the suite (or one shard of it) produced.
 * @property {string} [target] The install target's label, from `.lab/target.json`.
 * @property {string[]} dialects The fixture's dialects, in column order.
 * @property {TestOutcome[]} tests Every test, in file order and, within a file, in run order.
 * @property {string[]} unhandledErrors Errors outside any test, as text.
 * @property {Record<string, number>} files Seconds each test file took (vitest's module duration).
 * @property {"passed" | "failed" | "interrupted"} vitest How vitest itself judged the run.
 *
 * @typedef {object} Failure
 * @property {string} test
 * @property {string} reason
 *
 * @typedef {object} Cell
 * @property {Status} status
 * @property {string} text
 * @property {string[]} tests
 * @property {Failure[]} [failures] Only on a `FAIL` cell: each failing test and why it failed.
 *
 * @typedef {object} Row
 * @property {string} scenario
 * @property {Record<string, Cell>} cells
 *
 * @typedef {MatrixRun & { format: typeof SHARD_FORMAT, shard: { index: number, count: number }, generatedAt: string }} MatrixShard
 *   What one shard of a sharded run writes to `.lab/matrix.shard-<index>.json`.
 */

/** The `format` of a shard file, so the merge refuses any other JSON. */
export const SHARD_FORMAT = "askdb-consumer-lab-matrix-shard/1";

/**
 * Where shard `index` writes its outcomes, in `dir` (the lab's `.lab/`).
 * @param {string} dir
 * @param {number} index
 */
export function shardFile(dir, index) {
  return join(dir, `matrix.shard-${index}.json`);
}

/** Shard files that can't be merged: a shard missing, two of one shard, or shards of different runs. */
export class ShardMergeError extends Error {
  /** @param {string[]} problems */
  constructor(problems) {
    super(problems.join("\n"));
    this.problems = problems;
  }
}

/**
 * Every shard of one sharded run, as the one run they make up. Throws `ShardMergeError` unless
 * the shards are exactly shards 1 to N of N, of the same install target, each test file in one of them.
 * @param {{ file: string, shard: MatrixShard }[]} inputs Each shard, and the file it was read from.
 * @returns {{ run: MatrixRun, count: number, unfinished: string[] }} `unfinished`: a line for each
 *   shard whose vitest run didn't pass, which fails the merge as it failed that shard.
 */
export function mergeShards(inputs) {
  /** @type {string[]} */
  const problems = [];
  if (!inputs.length) throw new ShardMergeError(["no shard files to merge"]);
  for (const { file, shard } of inputs) {
    if (shard?.format !== SHARD_FORMAT) problems.push(`${file} isn't a lab matrix shard (no "format": "${SHARD_FORMAT}")`);
  }
  if (problems.length) throw new ShardMergeError(problems);

  const counts = [...new Set(inputs.map((i) => i.shard.shard.count))];
  if (counts.length > 1) throw new ShardMergeError([`the shard files are from runs split into different numbers of shards (${counts.join(", ")}): ${inputs.map((i) => i.file).join(", ")}`]);
  const count = /** @type {number} */ (counts[0]);
  for (let index = 1; index <= count; index++) {
    const files = inputs.filter((i) => i.shard.shard.index === index).map((i) => i.file);
    if (!files.length) problems.push(`shard ${index}/${count} is missing: its run ended before writing ${shardFile(".lab", index)} (it crashed, or timed out), or its file wasn't passed to the merge`);
    if (files.length > 1) problems.push(`shard ${index}/${count} is in more than one file: ${files.join(", ")}`);
  }
  for (const { file, shard } of inputs) {
    const { index } = shard.shard;
    if (!Number.isInteger(index) || index < 1 || index > count) problems.push(`${file} is shard ${index}/${count}, which doesn't exist`);
  }
  const targets = [...new Set(inputs.map((i) => i.shard.target ?? "(none)"))];
  if (targets.length > 1) problems.push(`the shards tested different install targets: ${targets.join(", ")}`);
  const dialects = [...new Set(inputs.map((i) => i.shard.dialects.join(",")))];
  if (dialects.length > 1) problems.push(`the shards have different dialects: ${dialects.join(" / ")}`);
  /** @type {Map<string, number>} */
  const ranIn = new Map();
  for (const { shard } of inputs) {
    for (const file of new Set(shard.tests.map((t) => t.file))) {
      const other = ranIn.get(file);
      if (other !== undefined) problems.push(`${file} ran in shard ${other}/${count} and in shard ${shard.shard.index}/${count}`);
      ranIn.set(file, shard.shard.index);
    }
  }
  if (problems.length) throw new ShardMergeError(problems);

  const shards = [...inputs].sort((a, b) => a.shard.shard.index - b.shard.shard.index).map((i) => i.shard);
  const unfinished = shards.flatMap((s) =>
    s.vitest === "passed" ? [] : [`shard ${s.shard.index}/${count}: vitest ${s.vitest === "interrupted" ? "was interrupted, so not every test ran" : "reported a failed run"}`],
  );
  /** @type {MatrixRun} */
  const run = {
    target: /** @type {MatrixShard} */ (shards[0]).target,
    dialects: /** @type {MatrixShard} */ (shards[0]).dialects,
    // A stable sort by file: the order one unsharded run reports its tests in.
    tests: shards.flatMap((s) => s.tests).sort((a, b) => a.file.localeCompare(b.file)),
    unhandledErrors: shards.flatMap((s) => s.unhandledErrors),
    files: Object.fromEntries(shards.flatMap((s) => Object.entries(s.files)).sort(([a], [b]) => a.localeCompare(b))),
    vitest: shards.some((s) => s.vitest === "interrupted") ? "interrupted" : shards.some((s) => s.vitest === "failed") ? "failed" : "passed",
  };
  return { run, count, unfinished };
}

/** The matrix's test-name rule: `[<dialect>] <scenario-id>…`, describe blocks joined by " " or " > ". */
export const NAME = /^\[([a-z]+)\][\s>]+([a-z0-9][\w-]*)/i;

/**
 * The golden-schema facts the schema artifact can't express, from the "Not comparable" rule in
 * `fixtures/multi-engine/dataset/NORMALIZATION.md` (survey note 6 in
 * `docs/specs/consumer-lab.md`). Rendered as `n/a (not in the schema artifact)` on every dialect.
 */
const ARTIFACT_LIMITS = ["unique-constraints", "view-marker"];
const ARTIFACT_LIMIT_TEXT = "n/a (not in the schema artifact)";

/** Failures written to the step summary; the rest are in the step log and `matrix.json`. */
const MAX_SUMMARY_FAILURES = 25;

/**
 * One cell from its tests' outcomes, or undefined when none of them ran.
 * @param {Outcome[]} outcomes
 * @param {string[]} tests
 * @returns {Cell | undefined}
 */
function combine(outcomes, tests) {
  const ran = outcomes.filter((o) => o.status !== "not-run");
  if (!ran.length) return undefined;
  // Each test's detail may list several items ("#377, #376"); list each item once per cell.
  /** @param {Status} s */
  const details = (s) =>
    [...new Set(ran.filter((o) => o.status === s).flatMap((o) => (o.detail ?? "").split(", ")).filter(Boolean))].join(", ");
  if (ran.some((o) => o.status === "fail")) {
    const failures = outcomes.flatMap((o, i) => (o.status === "fail" ? [{ test: /** @type {string} */ (tests[i]), reason: o.reason ?? "failed" }] : []));
    return { status: "fail", text: "FAIL", tests, failures };
  }
  if (ran.some((o) => o.status === "known")) return { status: "known", text: `known (${details("known")})`, tests };
  // A miss reason may hold ", " itself, so misses are joined with "; " and never split.
  if (ran.some((o) => o.status === "miss")) {
    const misses = [...new Set(ran.flatMap((o) => (o.status === "miss" && o.detail ? o.detail.split("; ") : [])))];
    return { status: "miss", text: `miss (${misses.join("; ")})`, tests };
  }
  // A gated test is never hidden behind a passing one in the same cell.
  if (ran.some((o) => o.status === "na")) return { status: "na", text: `n/a (${details("na")})`, tests };
  return { status: "pass", text: "pass", tests };
}

/**
 * @param {string[]} header
 * @param {string[][]} rows
 */
function table(header, rows) {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => /** @type {string} */ (r[i]).length)));
  /** @param {string[]} cells */
  const line = (cells) => cells.map((c, i) => c.padEnd(/** @type {number} */ (widths[i]))).join("  ").trimEnd();
  return [line(header), line(widths.map((w) => "-".repeat(w))), ...rows.map(line)].join("\n");
}

/**
 * @param {string[]} header
 * @param {string[][]} rows
 */
function markdown(header, rows) {
  /** @param {string[]} cells */
  const line = (cells) => `| ${cells.join(" | ")} |`;
  return [line(header), line(header.map(() => "---")), ...rows.map(line)].join("\n");
}

/** @param {string} text */
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * One collapsible block: a title, and a body shown as preformatted text.
 * @param {string} title
 * @param {string} body
 */
function details(title, body) {
  return `<details><summary>${title}</summary>\n\n<pre>${escapeHtml(body)}</pre>\n\n</details>`;
}

/**
 * The matrix of a run: its rows, built from the tests' names and outcomes.
 * @param {Pick<MatrixRun, "dialects" | "tests">} run
 */
export function buildMatrix(run) {
  /** @type {Map<string, Map<string, { outcomes: Outcome[]; tests: string[] }>>} */
  const scenarios = new Map();
  /** @type {string[]} */
  const unmatched = [];
  for (const { name, outcome } of run.tests) {
    const match = NAME.exec(name);
    const dialect = match?.[1]?.toLowerCase();
    if (!match || !dialect || !run.dialects.includes(dialect)) {
      unmatched.push(name);
      continue;
    }
    const scenario = /** @type {string} */ (match[2]);
    const row = scenarios.get(scenario) ?? new Map();
    scenarios.set(scenario, row);
    const cell = row.get(dialect) ?? { outcomes: [], tests: [] };
    row.set(dialect, cell);
    cell.outcomes.push(outcome);
    cell.tests.push(name);
  }
  /** @type {Row[]} */
  const rows = [...scenarios].map(([scenario, byDialect]) => ({
    scenario,
    cells: Object.fromEntries(
      run.dialects.flatMap((d) => {
        const entry = byDialect.get(d);
        const cell = entry && combine(entry.outcomes, entry.tests);
        return cell ? [[d, cell]] : [];
      }),
    ),
  }));
  const failedCells = rows.flatMap((r) =>
    run.dialects.filter((d) => r.cells[d]?.status === "fail").map((d) => ({ name: `${r.scenario} [${d}]`, cell: /** @type {Cell} */ (r.cells[d]) })),
  );
  return { rows, unmatched, failedCells };
}

/**
 * The matrix of a run, rendered: the text to print, `matrix.json`'s content, the step summary's
 * Markdown, and the names of the `FAIL` cells (any of which fails the run).
 * @param {MatrixRun} run
 * @param {object} [options]
 * @param {string} [options.title] The heading, before the target. Default `Consumer lab matrix`.
 * @param {string[]} [options.notes] Lines printed under the heading.
 * @param {string} [options.unhandledWhere] Where the unhandled errors were printed in full.
 */
export function renderMatrix(run, { title = "Consumer lab matrix", notes = [], unhandledWhere = "the output above" } = {}) {
  const { rows, unmatched, failedCells } = buildMatrix(run);
  const { target, dialects } = run;
  const annotations = ARTIFACT_LIMITS.map((scenario) => ({
    scenario,
    annotation: "not in the schema artifact (fixtures/multi-engine/dataset/NORMALIZATION.md)",
  }));

  const header = ["scenario", ...dialects];
  const cells = [
    ...rows.map((r) => [r.scenario, ...dialects.map((d) => r.cells[d]?.text ?? "-")]),
    ...annotations.map((a) => [`${a.scenario} *`, ...dialects.map(() => ARTIFACT_LIMIT_TEXT)]),
  ];
  const failed = failedCells.map((f) => f.name);
  const unhandled = run.unhandledErrors;

  const out = [
    "",
    `${title}${target ? ` (target: ${target})` : ""}`,
    ...notes,
    "",
    table(header, cells),
    "",
    "- = no test ran for this dialect",
    "* = annotation, not a test result: a golden-schema fact the schema artifact can't express (NORMALIZATION.md)",
  ];
  if (failed.length) out.push("", `${failed.length} FAIL cell(s): ${failed.join(", ")}`);
  if (unmatched.length) {
    out.push("", `Not in the matrix (name doesn't start with "[<dialect>] <scenario-id>"):`, ...unmatched.map((n) => `  ${n}`));
  }
  if (unhandled.length) out.push("", `${unhandled.length} unhandled error(s): see ${unhandledWhere}.`);

  const json = {
    target,
    generatedAt: new Date().toISOString(),
    dialects,
    rows,
    annotations,
    unmatched,
    unhandledErrors: unhandled,
    files: run.files,
  };

  const verdict = failed.length ? `**${failed.length} FAIL cell(s):** ${failed.join(", ")}\n\n` : "";
  const blocks = failedCells.flatMap(({ name, cell }) =>
    (cell.failures ?? []).map((f) => details(`<code>${escapeHtml(name)}</code>: ${escapeHtml(f.test)}`, f.reason)),
  );
  const shown = blocks.slice(0, MAX_SUMMARY_FAILURES);
  if (blocks.length > shown.length) shown.push(`…and ${blocks.length - shown.length} more failing test(s): see the step log or \`matrix.json\`.`);
  const why = shown.length ? `#### Why they failed\n\n${shown.join("\n\n")}\n\n` : "";
  const errors = unhandled.length
    ? `**${unhandled.length} unhandled error(s)** (outside any test):\n\n${unhandled.map((u, i) => details(`Unhandled error ${i + 1}`, u)).join("\n\n")}\n\n`
    : "";
  const summary = `### Consumer lab matrix${target ? ` (${target})` : ""}\n\n${markdown(header, cells)}\n\n${verdict}${why}${errors}`;

  return { text: out.join("\n"), json, summary, failed };
}
