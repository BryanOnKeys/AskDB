/**
 * AskDB's oxlint rules for code comments (docs/agents/code-review.md, "A comment explains; it
 * never grants an exception"). The rule API is ESLint's, so the file also loads in ESLint.
 *
 * - `askdb/deferred-work-names-an-issue`: a comment that puts work off names the issue or ADR
 *   that tracks it.
 * - `askdb/adr-citation-resolves`: an ADR a comment cites is in `docs/adrs/README.md` and is not
 *   superseded.
 *
 * The rules check that a pointer is there and that it resolves. Whether the issue or ADR says
 * what the comment claims is the reviewer's check.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ADR_INDEX = fileURLToPath(new URL("../../docs/adrs/README.md", import.meta.url));

/**
 * Words that put work off. A word that states a design choice ("deliberately", "by design") is
 * not here: on the first run all 20 such comments in the repo gave their reason in place.
 */
const DEFERRAL_PHRASES =
  /\b(for now|for the moment|temporarily|good enough|workaround|known limitation|out of scope|not worth|stop-?gap|follow-up)\b/i;

/** Task markers count only in capitals, so `.todo` and "hack" in prose pass. */
const DEFERRAL_MARKERS = /\b(TODO|FIXME|HACK|XXX)\b/;

/** What counts as a pointer: an ADR, an issue or PR number, or a security advisory. */
const POINTER = /\bADRs?[ -]\d{4}\b|#\d+\b|\bGHSA(-[0-9a-z]{4}){3}\b/;

/** "ADR 0012", "ADR-0012", "ADRs 0027 and 0028", "ADRs 0002, 0008". Not the year in "ADR 0006, 2026-09". */
const ADR_CITATION = /\bADRs?[ -]\d{4}(?![-\d])(?:(?:,| and|, and) \d{4}(?![-\d]))*/g;

/**
 * The deferral word a comment uses without a pointer, or `undefined`.
 * @param {string} text one comment, or a run of `//` lines read as one
 */
export function deferralWithoutPointer(text) {
  const word = DEFERRAL_PHRASES.exec(text) ?? DEFERRAL_MARKERS.exec(text);
  return word && !POINTER.test(text) ? word[0] : undefined;
}

/**
 * Every ADR number a comment cites.
 * @param {string} text
 * @returns {string[]}
 */
export function citedAdrs(text) {
  return [...text.matchAll(ADR_CITATION)].flatMap((m) => m[0].match(/\d{4}/g) ?? []);
}

/**
 * The index's ADRs and whether each is superseded, read from its table rows.
 * @param {string} indexMarkdown the text of `docs/adrs/README.md`
 * @returns {Map<string, { superseded: boolean }>}
 */
export function parseAdrIndex(indexMarkdown) {
  const adrs = new Map();
  for (const row of indexMarkdown.matchAll(/^\| \[(\d{4})\]\([^)]*\)[^|]*\|([^|]*)\|/gm)) {
    adrs.set(row[1], { superseded: /^\s*superseded/i.test(row[2]) });
  }
  return adrs;
}

/**
 * Why a cited ADR does not resolve, or `undefined` when it does.
 * @param {string} number four digits
 * @param {Map<string, { superseded: boolean }>} adrs
 */
export function citationProblem(number, adrs) {
  const adr = adrs.get(number);
  if (!adr) return `ADR ${number} is not in docs/adrs/README.md. Cite an ADR from that index.`;
  if (adr.superseded) return `ADR ${number} is superseded. Cite the ADR that replaced it.`;
  return undefined;
}

/**
 * Comments as a reader sees them: a block comment alone, and `//` lines on consecutive lines as
 * one comment, so a pointer on the second line counts for a deferral word on the first.
 * @param {ReadonlyArray<{ type: string, value: string, loc: { start: { line: number }, end: { line: number } } }>} comments
 */
export function groupComments(comments) {
  const groups = [];
  for (const comment of comments) {
    const last = groups.at(-1);
    const joins =
      last &&
      comment.type === "Line" &&
      last.type === "Line" &&
      comment.loc.start.line === last.loc.end.line + 1;
    if (joins) {
      last.text += `\n${comment.value}`;
      last.loc = { start: last.loc.start, end: comment.loc.end };
    } else {
      groups.push({ type: comment.type, text: comment.value, loc: comment.loc });
    }
  }
  return groups;
}

let cachedIndex;
function adrIndex() {
  cachedIndex ??= parseAdrIndex(readFileSync(ADR_INDEX, "utf8"));
  return cachedIndex;
}

function forEachComment(context, visit) {
  return {
    Program() {
      for (const group of groupComments(context.sourceCode.getAllComments())) visit(group);
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
        docs: { description: "An ADR a comment cites exists and is not superseded." },
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
