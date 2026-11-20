// Checks the two prose limits in STYLE.md, "Writing rules", that a script can count:
//
//   - no sentence over 30 words, on every page;
//   - no sentence with more than three code spans, on every page outside reference/.
//
// Tables, code blocks, headings, link-card lists, diagrams and agent prompts aren't prose and are
// skipped. The upgrade notes are a record of past releases and are exempt.
//
//   node scripts/check-prose.mjs            every page; exits 1 when a sentence is over a limit
//   node scripts/check-prose.mjs <page…>    only these pages (paths under src/content/docs)
import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const MAX_WORDS = 30;
export const MAX_CODE_SPANS = 3;

/** Pages whose sentences aren't held to the limits, with the reason. */
export const EXEMPT = new Map([["reference/upgrade-notes.mdx", "a record of past releases"]]);

/** Whether a page's sentences are also held to the code-span limit: every page but the reference. */
export const capsCodeSpans = (page) => !page.startsWith("reference/");

/**
 * The prose sentences of a page's MDX source, each with the line it starts on. A list item and a
 * paragraph each start their own sentence, so a list of short items isn't read as one long one.
 */
export function sentences(mdx) {
  const lines = mdx.split("\n");
  const blocks = [];
  let fence = false;
  let frontMatter = lines[0] === "---";
  let skipUntil = null; // a closing tag: the block in between isn't prose
  let current = null;
  const flush = () => {
    if (current) blocks.push(current);
    current = null;
  };
  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (frontMatter) {
      if (index > 0 && line === "---") frontMatter = false;
      return;
    }
    if (line.startsWith("```")) {
      fence = !fence;
      return flush();
    }
    if (fence) return;
    if (skipUntil) {
      if (line.includes(skipUntil)) skipUntil = null;
      return;
    }
    if (/^<(AgentPrompt|FileTree)\b/.test(line)) {
      skipUntil = `</${line.match(/^<(\w+)/)[1]}>`;
      return flush();
    }
    // Not prose: blank lines, imports, headings, table rows, link cards, and lines that are only a tag.
    if (line === "" || /^(import |export |#{1,6} |\|)/.test(line) || /^- \[[^\]]+\]\([^)]+\): /.test(line) || /^<\/?[A-Za-z][^>]*>$/.test(line)) return flush();
    const item = line.match(/^(?:[-*]|\d+\.)\s+(.*)$/);
    if (item) {
      flush();
      current = { line: index + 1, text: item[1] };
    } else if (current) current.text += ` ${line}`;
    else current = { line: index + 1, text: line };
  });
  flush();

  const found = [];
  for (const block of blocks) {
    const text = block.text
      .replace(/<[^>]+>/g, " ") // inline tags, such as <figcaption> and <code>
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // a link reads as its text
      .replace(/[*_]{1,2}/g, "");
    // A sentence ends at ., ! or ? (and a closing quote or bracket after it) before a space and a
    // capital, a backtick or a quote. Code spans
    // are set aside first, so a period or a question mark inside one ends nothing. A colon doesn't
    // end a sentence: what follows it is the same thought.
    const spans = [];
    const masked = text.replace(/`[^`]*`/g, (span) => `\u0000${spans.push(span) - 1}\u0000`);
    // oxlint-disable-next-line no-control-regex -- \u0000 marks a masked code span.
    for (const sentence of masked.split(/(?<=[.!?]["”)]?)\s+(?=[A-Z\u0000"“(])/)) {
      // oxlint-disable-next-line no-control-regex -- \u0000 marks a masked code span.
      const trimmed = sentence.replace(/\u0000(\d+)\u0000/g, (_, index) => spans[Number(index)]).trim();
      if (trimmed) found.push({ line: block.line, text: trimmed });
    }
  }
  return found;
}

/** A sentence's words: each code span counts as one. */
export const wordCount = (sentence) => sentence.replace(/`[^`]*`/g, "code").split(/\s+/).filter(Boolean).length;
export const codeSpans = (sentence) => (sentence.match(/`[^`]+`/g) ?? []).length;

/** The sentences of `mdx` that are over a limit. `capCode` is whether the code-span limit applies. */
export function proseIssues(mdx, { capCode = true } = {}) {
  const issues = [];
  for (const { line, text } of sentences(mdx)) {
    const words = wordCount(text);
    const spans = codeSpans(text);
    if (words > MAX_WORDS) issues.push({ line, rule: "words", count: words, text });
    else if (capCode && spans > MAX_CODE_SPANS) issues.push({ line, rule: "code", count: spans, text });
  }
  return issues;
}

function pages(root) {
  const found = [];
  (function walk(dir) {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.mdx?$/.test(name)) found.push(relative(root, path));
    }
  })(root);
  return found;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("../src/content/docs/", import.meta.url));
  const only = process.argv.slice(2);
  let total = 0;
  for (const page of only.length ? only : pages(root)) {
    if (EXEMPT.has(page)) continue;
    const issues = proseIssues(readFileSync(join(root, page), "utf8"), { capCode: capsCodeSpans(page) });
    for (const issue of issues) {
      const limit = issue.rule === "words" ? `${issue.count} words (limit ${MAX_WORDS})` : `${issue.count} code spans (limit ${MAX_CODE_SPANS})`;
      console.error(`${page}:${issue.line}: ${limit}: ${issue.text.slice(0, 110)}${issue.text.length > 110 ? "…" : ""}`);
    }
    total += issues.length;
  }
  if (total > 0) {
    console.error(`\n${total} sentence${total === 1 ? "" : "s"} over a prose limit. Split it, or move its detail to a list, a table or the reference page (STYLE.md, "Writing rules").`);
    process.exit(1);
  }
  console.log("Every sentence is within the prose limits.");
}
