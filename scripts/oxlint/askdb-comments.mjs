/**
 * AskDB's oxlint rules for code comments (docs/agents/code-review.md, "Enforced by tooling").
 * The rule API is ESLint's, so the file also loads in ESLint. The plugin and its test sit in
 * their own folder because `.oxlintrc.json` loads the plugin by path.
 *
 * - `askdb/deferred-work-names-an-issue`: a comment that puts work off, in one of the listed
 *   wordings, names the issue or ADR that tracks it.
 * - `askdb/adr-citation-resolves`: an ADR a comment cites is in `docs/adrs/README.md` with the
 *   status Accepted.
 *
 * The word list is closed and prose is open, so the first rule catches the common wordings and
 * no more: a comment that puts work off in other words passes, and a reviewer still reads for it.
 * Whether the issue or ADR says what the comment claims is the reviewer's check too.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ADR_INDEX = fileURLToPath(new URL("../../docs/adrs/README.md", import.meta.url));

/**
 * Wordings that put work off. A word that states a design choice ("deliberately", "by design")
 * is not here: such a comment explains the code and puts nothing off.
 */
const DEFERRAL_PHRASES =
  /\b(for now|for the moment|temporarily|good enough|workaround|known limitation|out of scope|not worth|stop-?gap|follow-up)\b/i;

/** Task markers count only in capitals, so `.todo` and "hack" in prose pass. */
const DEFERRAL_MARKERS = /\b(TODO|FIXME|HACK|XXX)\b/;

/** One ADR number: four digits, not the start of a date ("2026-09") or of a longer number. */
const ADR_NUMBER = String.raw`\d{4}(?!-?\d)`;

/** A later number in a list starts with 0, so the year in "ADR 0006, 2026 amendment" is not one. */
const ADR_LIST_SEPARATOR = String.raw`(?:, (?:and |or )?| and | or | & |\/|–)`;

/** "ADR 0012", "ADR-0012", "ADRs 0027 and 0028", "ADRs 0002, 0008", "ADRs 0012/0013", "ADR 0041-docs.md". */
const ADR_CITATION = new RegExp(String.raw`\bADRs?[ -]${ADR_NUMBER}(?:${ADR_LIST_SEPARATOR}0${String.raw`\d{3}(?!-?\d)`})*`, "g");

/** What counts as a pointer: an ADR, an issue or PR number, or a security advisory. */
const POINTER = new RegExp(String.raw`\bADRs?[ -]${ADR_NUMBER}|#\d+\b|\bGHSA(-[0-9a-z]{4}){3}\b`);

/** A lint directive is not prose: it is never checked and never joined to a comment beside it. */
const DIRECTIVE = /^\s*(oxlint|eslint)-(disable|enable)\b/;

/**
 * A comment's words on one line: JSDoc ` * ` prefixes removed and every run of whitespace made
 * one space, so a phrase or a citation that wraps onto the next line still reads as written.
 * @param {string} text
 */
export function commentWords(text) {
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*\*+ ?/, ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The deferral word a comment uses without a pointer, or `undefined`.
 * @param {string} text one comment, or a run of `//` lines read as one
 */
export function deferralWithoutPointer(text) {
  const words = commentWords(text);
  const word = DEFERRAL_PHRASES.exec(words) ?? DEFERRAL_MARKERS.exec(words);
  return word && !POINTER.test(words) ? word[0] : undefined;
}

/**
 * Every ADR number a comment cites.
 * @param {string} text
 * @returns {string[]}
 */
export function citedAdrs(text) {
  return [...commentWords(text).matchAll(ADR_CITATION)].flatMap((m) => m[0].match(/\d{4}/g) ?? []);
}

/**
 * The index's ADRs and the status of each, read from its table rows.
 * @param {string} indexMarkdown the text of `docs/adrs/README.md`
 * @returns {Map<string, { status: string }>}
 */
export function parseAdrIndex(indexMarkdown) {
  const adrs = new Map();
  for (const row of indexMarkdown.matchAll(/^\| \[(\d{4})\]\([^)]*\)[^|]*\|([^|]*)\|/gm)) {
    adrs.set(row[1], { status: row[2].replace(/\*/g, "").trim() });
  }
  return adrs;
}

/**
 * Why a cited ADR does not resolve, or `undefined` when it does: only an Accepted ADR resolves.
 * @param {string} number four digits
 * @param {Map<string, { status: string }>} adrs
 */
export function citationProblem(number, adrs) {
  const adr = adrs.get(number);
  if (!adr) return `ADR ${number} is not in docs/adrs/README.md. Cite an ADR from that index.`;
  if (!/^accepted\b/i.test(adr.status)) {
    return `ADR ${number} is "${adr.status}" in docs/adrs/README.md. Cite an accepted ADR.`;
  }
  return undefined;
}

/**
 * Comments as a reader sees them: a block comment alone, and `//` lines on consecutive lines as
 * one comment, so a pointer on the second line counts for a deferral word on the first. A `//`
 * after code on its line is its own comment, and so is a lint directive, which is left out.
 * @param {ReadonlyArray<{ type: string, value: string, loc: { start: { line: number, column: number }, end: { line: number } } }>} comments
 * @param {ReadonlyArray<string>} [lines] the file's lines; without them every `//` counts as alone on its line
 */
export function groupComments(comments, lines) {
  const groups = [];
  for (const comment of comments) {
    if (DIRECTIVE.test(comment.value)) {
      groups.push({ directive: true });
      continue;
    }
    const before = lines?.[comment.loc.start.line - 1]?.slice(0, comment.loc.start.column) ?? "";
    const ownLine = comment.type === "Line" && before.trim() === "";
    const last = groups.at(-1);
    if (last?.ownLine && ownLine && comment.loc.start.line === last.loc.end.line + 1) {
      last.text += `\n${comment.value}`;
      last.loc = { start: last.loc.start, end: comment.loc.end };
    } else {
      groups.push({ ownLine, text: comment.value, loc: comment.loc });
    }
  }
  return groups.filter((group) => !group.directive);
}

let cachedIndex;
function adrIndex() {
  cachedIndex ??= parseAdrIndex(readFileSync(ADR_INDEX, "utf8"));
  return cachedIndex;
}

function forEachComment(context, visit) {
  return {
    Program() {
      const { sourceCode } = context;
      for (const group of groupComments(sourceCode.getAllComments(), sourceCode.lines)) visit(group);
    },
  };
}

export default {
  meta: { name: "askdb" },
  rules: {
    "deferred-work-names-an-issue": {
      meta: {
        type: "problem",
        docs: { description: "A comment that puts work off names the issue or ADR that tracks it." },
        schema: [],
      },
      create(context) {
        return forEachComment(context, (group) => {
          const word = deferralWithoutPointer(group.text);
          if (!word) return;
          context.report({
            loc: group.loc,
            message: `This comment puts work off ("${word}") and names no issue. Do the work, or name the issue or ADR that tracks it (#123, ADR 0012). Another wording for the same gap does not fix it.`,
          });
        });
      },
    },
    "adr-citation-resolves": {
      meta: {
        type: "problem",
        docs: { description: "An ADR a comment cites is in the index with the status Accepted." },
        schema: [],
      },
      create(context) {
        return forEachComment(context, (group) => {
          for (const number of new Set(citedAdrs(group.text))) {
            const message = citationProblem(number, adrIndex());
            if (message) context.report({ loc: group.loc, message });
          }
        });
      },
    },
  },
};
