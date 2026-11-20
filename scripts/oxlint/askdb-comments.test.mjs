import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  citationProblem,
  citedAdrs,
  deferralWithoutPointer,
  groupComments,
  parseAdrIndex,
} from "./askdb-comments.mjs";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const plugin = fileURLToPath(new URL("./askdb-comments.mjs", import.meta.url));

test("a comment that puts work off without a pointer is reported, with the word", () => {
  assert.equal(deferralWithoutPointer(" Nested arrays are skipped for now."), "for now");
  assert.equal(deferralWithoutPointer(" A workaround for the driver's bug."), "workaround");
  assert.equal(deferralWithoutPointer(" columns (no defaults yet — follow-up)"), "follow-up");
  assert.equal(deferralWithoutPointer(" TODO: handle nested arrays"), "TODO");
});

test("an ADR, an issue or an advisory in the same comment is a pointer", () => {
  assert.equal(deferralWithoutPointer(" Out of scope until #972."), undefined);
  assert.equal(deferralWithoutPointer(" TODO(#310): move the sensitive check."), undefined);
  assert.equal(deferralWithoutPointer(" A stopgap; ADR 0010 has the plan."), undefined);
  assert.equal(deferralWithoutPointer(" Known limitation, GHSA-8pwj-6hfv-5pm4."), undefined);
});

test("a comment that states a design choice, or only looks like a marker, passes", () => {
  assert.equal(deferralWithoutPointer(" Deliberately broad: a wrong alias would bind the wrong table."), undefined);
  assert.equal(deferralWithoutPointer(" Filtered out (`-t`, `.skip`, `.todo`): the test never ran."), undefined);
  assert.equal(deferralWithoutPointer(" The workarounds table lists each driver."), undefined);
});

test("every number in an ADR citation is read, and a year after it is not", () => {
  assert.deepEqual(citedAdrs(" (ADR 0010, decision 2)"), ["0010"]);
  assert.deepEqual(citedAdrs(" file access is core's (ADRs 0027 and 0028)"), ["0027", "0028"]);
  assert.deepEqual(citedAdrs(" ADRs 0002, 0008, and 0029; see ADR-0024"), ["0002", "0008", "0029", "0024"]);
  assert.deepEqual(citedAdrs(" (ADR 0006, 2026-09 amendment)"), ["0006"]);
  assert.deepEqual(citedAdrs(" port 5432 and #0012 are not citations"), []);
});

test("the index gives each ADR and whether it is superseded", () => {
  const adrs = parseAdrIndex(
    [
      "| ADR | Status | Keep |",
      "|---|---|---|",
      "| [0033](0033-x.md) Error codes leave | Accepted | Don't add a code. |",
      "| [0034](0034-x.md) Docs diagrams are D2 | Superseded by 0041 | None. |",
    ].join("\n"),
  );
  assert.deepEqual([...adrs.keys()], ["0033", "0034"]);
  assert.equal(citationProblem("0033", adrs), undefined);
  assert.match(citationProblem("0034", adrs), /superseded/);
  assert.match(citationProblem("0099", adrs), /not in docs\/adrs\/README\.md/);
});

test("the repo's own index parses: a row for each ADR, with 0034 superseded", () => {
  const adrs = parseAdrIndex(readFileSync(join(repoRoot, "docs/adrs/README.md"), "utf8"));
  assert.ok(adrs.size >= 51, `expected at least 51 rows, read ${adrs.size}`);
  assert.equal(adrs.get("0034")?.superseded, true);
  assert.equal(adrs.get("0012")?.superseded, false);
});

test("consecutive // lines are one comment; a block comment stands alone", () => {
  const line = (n, value) => ({ type: "Line", value, loc: { start: { line: n }, end: { line: n } } });
  const groups = groupComments([
    line(1, " No defaults yet, a follow-up:"),
    line(2, " #1072 tracks it."),
    line(4, " A separate comment."),
    { type: "Block", value: " block ", loc: { start: { line: 5 }, end: { line: 5 } } },
  ]);
  assert.equal(groups.length, 3);
  assert.equal(deferralWithoutPointer(groups[0].text), undefined);
  assert.deepEqual(groups[0].loc, { start: { line: 1 }, end: { line: 2 } });
});

test("oxlint loads the plugin and reports both rules on a file", () => {
  const dir = mkdtempSync(join(tmpdir(), "askdb-comments-"));
  try {
    writeFileSync(
      join(dir, ".oxlintrc.json"),
      JSON.stringify({
        jsPlugins: [plugin],
        categories: { correctness: "off" },
        rules: {
          "askdb/deferred-work-names-an-issue": "error",
          "askdb/adr-citation-resolves": "error",
        },
      }),
    );
    writeFileSync(
      join(dir, "sample.ts"),
      [
        "// Nested arrays are skipped for now.",
        "export const a = 1;",
        "/** Out of scope until #972 decides the other relations. */",
        "export const b = 2;",
        "// Rendered as D2 (ADR 0034), and see ADR 0099.",
        "export const c = 3;",
        "",
      ].join("\n"),
    );
    // The installed binary, not `pnpm exec`: pnpm would install dependencies first in a checkout that has none.
    const oxlint = join(repoRoot, "node_modules/.bin/oxlint");
    const run = spawnSync(oxlint, ["-c", join(dir, ".oxlintrc.json"), join(dir, "sample.ts")], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(run.error, undefined, `oxlint did not start: ${run.error?.message}. Run pnpm install first.`);
    const output = run.stdout + run.stderr;
    assert.equal(run.status, 1, output);
    assert.match(output, /puts work off \("for now"\)/);
    assert.match(output, /ADR 0034 is superseded/);
    assert.match(output, /ADR 0099 is not in docs\/adrs\/README\.md/);
    assert.doesNotMatch(output, /"Out of scope"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
