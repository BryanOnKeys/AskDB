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

/** A `//` comment as the parser reports it, at `column` on line `n`. */
const lineComment = (n, value, column = 0) => ({
  type: "Line",
  value,
  loc: { start: { line: n, column }, end: { line: n, column: column + value.length + 2 } },
});

test("a comment that puts work off without a pointer is reported, with the word", () => {
  assert.equal(deferralWithoutPointer(" Nested arrays are skipped for now."), "for now");
  assert.equal(deferralWithoutPointer(" A workaround for the driver's bug."), "workaround");
  assert.equal(deferralWithoutPointer(" columns (no defaults yet — follow-up)"), "follow-up");
  assert.equal(deferralWithoutPointer(" TODO: handle nested arrays"), "TODO");
});

test("a phrase that wraps onto the next line is still read", () => {
  assert.equal(deferralWithoutPointer(" Nested arrays are skipped for\n now."), "for now");
  assert.equal(deferralWithoutPointer("*\n * This is out of\n * scope here.\n "), "out of scope");
});

test("an ADR, an issue or an advisory in the same comment is a pointer", () => {
  assert.equal(deferralWithoutPointer(" Out of scope until #972."), undefined);
  assert.equal(deferralWithoutPointer(" TODO(#310): move the sensitive check."), undefined);
  assert.equal(deferralWithoutPointer(" A stopgap; ADR 0010 has the plan."), undefined);
  assert.equal(deferralWithoutPointer(" A stopgap; see ADR\n 0010."), undefined);
  assert.equal(deferralWithoutPointer(" Known limitation, GHSA-8pwj-6hfv-5pm4."), undefined);
});

test("a comment that states a design choice, or only looks like a marker, passes", () => {
  assert.equal(deferralWithoutPointer(" Deliberately broad: a wrong alias would bind the wrong table."), undefined);
  assert.equal(deferralWithoutPointer(" Filtered out (`-t`, `.skip`, `.todo`): the test never ran."), undefined);
  assert.equal(deferralWithoutPointer(" The workarounds table lists each driver."), undefined);
});

test("the word list is closed: these wordings put work off and still pass", () => {
  // Known misses, kept here so the list is not grown one review at a time. A reviewer reads for them.
  for (const text of [" Deferred to a later release.", " An interim fix.", " todo: handle arrays", " Not supported yet."]) {
    assert.equal(deferralWithoutPointer(text), undefined, text);
  }
});

test("every number in an ADR citation is read", () => {
  assert.deepEqual(citedAdrs(" (ADR 0010, decision 2)"), ["0010"]);
  assert.deepEqual(citedAdrs(" file access is core's (ADRs 0027 and 0028)"), ["0027", "0028"]);
  assert.deepEqual(citedAdrs(" ADRs 0002, 0008, and 0029; see ADR-0024"), ["0002", "0008", "0029", "0024"]);
  assert.deepEqual(citedAdrs(" ADRs 0012/0099, ADR 0012 or 0098, ADRs 0012–0097, ADR 0012 & 0096"), [
    "0012", "0099", "0012", "0098", "0012", "0097", "0012", "0096",
  ]);
  assert.deepEqual(citedAdrs(" see ADR 0034-docs-diagrams.md"), ["0034"]);
  assert.deepEqual(citedAdrs(" see ADR\n * 0099 for why"), ["0099"]);
});

test("a year or a date after an ADR number is not a citation", () => {
  assert.deepEqual(citedAdrs(" (ADR 0006, 2026-09 amendment)"), ["0006"]);
  assert.deepEqual(citedAdrs(" (ADR 0006, 2026 amendment)"), ["0006"]);
  assert.deepEqual(citedAdrs(" ADR 0012 and 2026 both"), ["0012"]);
  assert.deepEqual(citedAdrs(" port 5432 and #0012 are not citations"), []);
});

test("only an ADR the index lists as Accepted resolves", () => {
  const adrs = parseAdrIndex(
    [
      "| ADR | Status | Keep |",
      "|---|---|---|",
      "| [0033](0033-x.md) Error codes leave | Accepted | Don't add a code. |",
      "| [0034](0034-x.md) Docs diagrams are D2 | Superseded by 0041 | None. |",
      "| [0035](0035-x.md) One version | Accepted (supersedes 0001) | None. |",
      "| [0036](0036-x.md) A proposal | Proposed | None. |",
      "| [0037](0037-x.md) Bold | **Superseded** by 0065 | None. |",
      "| [0038](0038-x.md) Rejected | Rejected | None. |",
    ].join("\n"),
  );
  assert.deepEqual([...adrs.keys()], ["0033", "0034", "0035", "0036", "0037", "0038"]);
  assert.equal(citationProblem("0033", adrs), undefined);
  assert.equal(citationProblem("0035", adrs), undefined);
  assert.match(citationProblem("0034", adrs), /is "Superseded by 0041"/);
  assert.match(citationProblem("0036", adrs), /is "Proposed"/);
  assert.match(citationProblem("0037", adrs), /is "Superseded by 0065"/);
  assert.match(citationProblem("0038", adrs), /is "Rejected"/);
  assert.match(citationProblem("0099", adrs), /not in docs\/adrs\/README\.md/);
});

test("the repo's own index parses: a row for each ADR, with 0034 superseded", () => {
  const adrs = parseAdrIndex(readFileSync(join(repoRoot, "docs/adrs/README.md"), "utf8"));
  assert.ok(adrs.size >= 51, `expected at least 51 rows, read ${adrs.size}`);
  assert.match(citationProblem("0034", adrs), /Superseded/);
  assert.equal(citationProblem("0012", adrs), undefined);
});

test("consecutive // lines are one comment; a block comment stands alone", () => {
  const groups = groupComments([
    lineComment(1, " No defaults yet, a follow-up:"),
    lineComment(2, " #1072 tracks it."),
    lineComment(4, " A separate comment."),
    { type: "Block", value: " block ", loc: { start: { line: 5, column: 0 }, end: { line: 5, column: 11 } } },
  ]);
  assert.equal(groups.length, 3);
  assert.equal(deferralWithoutPointer(groups[0].text), undefined);
  assert.equal(groups[0].loc.start.line, 1);
  assert.equal(groups[0].loc.end.line, 2);
});

test("a // after code is its own comment: a pointer on the next statement's comment does not count", () => {
  const lines = ["export const a = 1; // TODO: retries", "export const b = 2; // retries, see #441"];
  const groups = groupComments([lineComment(1, " TODO: retries", 20), lineComment(2, " retries, see #441", 20)], lines);
  assert.equal(groups.length, 2);
  assert.equal(deferralWithoutPointer(groups[0].text), "TODO");
});

test("a lint directive is not checked and is not joined to the comment below it", () => {
  const groups = groupComments([
    lineComment(1, " oxlint-disable-next-line askdb/deferred-work-names-an-issue -- a workaround, for now"),
    lineComment(2, " Nested arrays are skipped for now."),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].loc.start.line, 2);
  assert.equal(deferralWithoutPointer(groups[0].text), "for now");
});

/** Run the installed oxlint with both rules on one file's text, and return its exit status and output. */
function lint(source) {
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
    writeFileSync(join(dir, "sample.ts"), source);
    // The installed binary, not `pnpm exec`: pnpm would install dependencies first in a checkout that has none.
    const oxlint = join(repoRoot, "node_modules/.bin/oxlint");
    const run = spawnSync(oxlint, ["-c", join(dir, ".oxlintrc.json"), join(dir, "sample.ts")], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(run.error, undefined, `oxlint did not start: ${run.error?.message}. Run pnpm install first.`);
    return { status: run.status, output: run.stdout + run.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("oxlint loads the plugin and reports both rules on a file", () => {
  const { status, output } = lint(
    [
      "// Nested arrays are skipped for now.",
      "export const a = 1;",
      "/** Out of scope until #972 decides the other relations. */",
      "export const b = 2;",
      "// Rendered as D2 (ADR 0034), and see ADR 0099.",
      "export const c = 3;",
      "/* a workaround for the driver */",
      "export const d = 4;",
      "// No defaults yet, a follow-up:",
      "// #1072 tracks it.",
      "export const e = 5;",
      "",
    ].join("\n"),
  );
  assert.equal(status, 1, output);
  assert.match(output, /puts work off \("for now"\)/);
  assert.match(output, /puts work off \("workaround"\)/);
  assert.match(output, /ADR 0034 is "Superseded/);
  assert.match(output, /ADR 0099 is not in docs\/adrs\/README\.md/);
  assert.doesNotMatch(output, /"Out of scope"/);
  assert.doesNotMatch(output, /"follow-up"/);
});

test("a disable directive above a // comment turns the rule off for that comment", () => {
  const { status, output } = lint(
    [
      "// oxlint-disable-next-line askdb/deferred-work-names-an-issue -- the fixture needs the wording",
      "// Nested arrays are skipped for now.",
      "export const a = 1;",
      "",
    ].join("\n"),
  );
  assert.equal(status, 0, output);
});
