#!/usr/bin/env node
// Renders the per-package results that `scripts/test-utils/summary-reporter.mjs` wrote
// into `ASKDB_TEST_SUMMARY_DIR` as one Markdown table, for `$GITHUB_STEP_SUMMARY`.
//
//   node scripts/test-summary.mjs "<title>" >> "$GITHUB_STEP_SUMMARY"
//
// Failing packages sort first. Failed test names are listed under the table.
//
// A package whose `test` Turbo replayed from its cache didn't run vitest, so it has no record
// in `ASKDB_TEST_SUMMARY_DIR`. Turbo restored the copy the reporter keeps in the package
// (`.vitest/test-summary.json`, the `test` task's declared output) instead, and that becomes a
// "cached" row with the counts from the run that was cached. Turbo caches only tasks that
// succeeded, so a cached row never hides a failure. CI checks out a clean tree, so that file is
// there only when this run's vitest wrote it (and then the fresh record wins) or Turbo restored it.
//
// Workspace packages whose `test` script runs vitest but that have neither (a run that stopped
// before their tests finished) get a row too, so none go missing.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const title = process.argv[2] ?? "Tests";
const dir = process.env.ASKDB_TEST_SUMMARY_DIR;

const fresh =
  dir && existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")))
    : [];

/** Workspace packages whose `test` script runs vitest, as `{ name, path }`. */
function vitestPackages() {
  const projects = JSON.parse(execFileSync("pnpm", ["-r", "ls", "--json", "--depth", "-1"], { encoding: "utf8" }));
  return projects.filter(
    (p) => p.name && /\bvitest\b/.test(JSON.parse(readFileSync(join(p.path, "package.json"), "utf8")).scripts?.test ?? ""),
  );
}

const ran = new Set(fresh.map((r) => r.package));
const cached = [];
const missing = [];
for (const { name, path } of vitestPackages()) {
  if (ran.has(name)) continue;
  const replayed = join(path, ".vitest", "test-summary.json");
  if (existsSync(replayed)) cached.push({ ...JSON.parse(readFileSync(replayed, "utf8")), package: name, cached: true });
  else missing.push(name);
}
missing.sort();
const records = [...fresh, ...cached];

const failed = (r) => r.files.failed > 0 || r.tests.failed > 0 || r.unhandledErrors > 0;
const status = (r) => (failed(r) ? "❌" : r.cached ? "♻️" : r.tests.passed === 0 ? "⏭️" : "✅");
const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`;

const lines = [`## ${title}`, ""];
if (records.length === 0) {
  lines.push("No test results were recorded (the run stopped before any package finished its tests).");
} else {
  records.sort((a, b) => Number(failed(b)) - Number(failed(a)) || a.package.localeCompare(b.package));
  const total = { files: 0, passed: 0, failed: 0, skipped: 0 };
  lines.push("| | Package | Files | Passed | Failed | Skipped | Time |", "|---|---|--:|--:|--:|--:|--:|");
  for (const r of records) {
    const files = r.files.passed + r.files.failed + r.files.skipped;
    total.files += files;
    total.passed += r.tests.passed;
    total.failed += r.tests.failed;
    total.skipped += r.tests.skipped;
    const errors = r.unhandledErrors ? ` (+${r.unhandledErrors} unhandled error${r.unhandledErrors === 1 ? "" : "s"})` : "";
    const time = r.cached ? "cached" : seconds(r.durationMs);
    lines.push(
      `| ${status(r)} | \`${r.package}\` | ${files} | ${r.tests.passed} | ${r.tests.failed}${errors} | ${r.tests.skipped} | ${time} |`,
    );
  }
  for (const name of missing) lines.push(`| ⚪ | \`${name}\` | – | – | – | – | – |`);
  const packages = `${records.length} package${records.length === 1 ? "" : "s"}`;
  const counted = cached.length > 0 ? `${packages}, ${cached.length} cached` : packages;
  lines.push(`| | **Total (${counted})** | **${total.files}** | **${total.passed}** | **${total.failed}** | **${total.skipped}** | |`);
  if (cached.length > 0) {
    lines.push(
      "",
      "♻️ = cached: the package's test inputs haven't changed since a run that passed, so Turbo replayed that run instead of running vitest. Its counts are from that run.",
    );
  }
  if (missing.length > 0) {
    lines.push("", "⚪ = no result recorded: this package's tests didn't finish in this run.");
  }
  if (records.some((r) => status(r) === "⏭️")) {
    lines.push("", "⏭️ = every test in the package skipped (for example, integration suites without a database).");
  }

  const failures = records.flatMap((r) => r.failures.map((f) => ({ ...f, package: r.package })));
  if (failures.length > 0) {
    lines.push("", "### Failed tests", "");
    for (const f of failures) lines.push(`- \`${f.package}\` · \`${f.file}\` · ${f.name}`);
  }
}

process.stdout.write(`${lines.join("\n")}\n`);
