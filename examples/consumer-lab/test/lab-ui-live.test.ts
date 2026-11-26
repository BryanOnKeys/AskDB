/**
 * `pnpm lab ui` with the live model: a `lab ui` given a fake key and the stand-in for OpenAI,
 * driven over HTTP the way its page drives it (`POST /api/run`, read back as NDJSON).
 *
 * `lab ui`'s scenarios are split over the `lab-ui-*.test.ts` files, so vitest runs them on
 * different workers; what they share is in `support/lab-ui.ts`. No production seam: the tests
 * start the real `pnpm lab ui` command (through tsx's loader, as `pnpm lab` does) and send the
 * requests the page sends. The `lab ui` here gets a fake key and the stand-in for OpenAI
 * (`support/stub-openai-fetch.mjs`, preloaded with `NODE_OPTIONS`), which replaces `fetch` for
 * `api.openai.com` only and accepts only that key: none can reach the network or spend.
 *
 * The scenario runs on SQLite only, so its cells are `[sqlite]`.
 *
 * Needs the `cli-introspect-engine` capability (every column builds a schema artifact), the
 * fixture (`pnpm fixture:up`) and an installed lab (`pnpm lab:use .`).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, expect, it } from "vitest";
import { needsCapability } from "../src/capabilities.js";
import { LAB_ROOT } from "../src/paths.js";
import type { UiInput } from "../src/ui/server.js";
import { AGENCY_NAMES, column, PROGRAMS_SINCE, SATO, startLabUiProcess, uiRun, UNPAID, type LabUiProcess } from "./support/lab-ui.js";
import { STUB_KEY, stubOpenAiEnv } from "./support/stub-openai.js";

/** A `lab ui` with the live model: the fake key, and the stand-in's replies. */
const liveStub = stubOpenAiEnv({
  [AGENCY_NAMES]: (JSON.parse(readFileSync(join(LAB_ROOT, "cassettes", "sqlite", "agency-names.json"), "utf8")) as { reply: string }).reply,
  // A refusal that echoes the key, as OpenAI's does.
  [SATO]: { status: 401 },
  // A write: AskDB rejects it.
  [UNPAID]: '```sql\nDELETE FROM "order" WHERE is_paid = 0\n```',
  // The right rows, but only the inline statement: no sql-unbound block, no manifest.
  [PROGRAMS_SINCE]: "```sql\nSELECT agency_id, program_code FROM program WHERE starts_on >= '2022-01-01' ORDER BY agency_id, program_code\n```",
});
let liveUi: Promise<LabUiProcess> | undefined;
const liveRun = async (input: UiInput) => uiRun(await (liveUi ??= startLabUiProcess({ env: liveStub.env })), input);

afterAll(async () => {
  await liveUi?.then((u) => u.close());
  liveStub.dispose();
});

/*
 * Protects: the page's live option (#448). With a key, a live run asks the live model, with
 * that key, through the path picked (both documented paths work end to end), never the replay
 * server; each column ends with the grader's verdict (`gradeCatalogAnswer`), and the summary's
 * oracle chip shows that same verdict, which checks more than the rows (the parameterized
 * question's form, a rejection, which has no rows). A failed model call reaches the page with
 * the key the provider echoed redacted.
 * Catches: a live run that loses the live settings between the page, the server and the engine
 * process and silently replays; a path the live run drops; and a summary that calls an answer
 * a match while its column says the oracle missed it.
 * Not covered elsewhere: `lab-ask-live` covers `lab ask --model live`, not the server or its
 * engine processes; the other `lab ui` scenarios all run the replay model.
 */
it.for([
  ["raw", "model:      live gpt-4o-mini at https://api.openai.com/v1, via createOpenAI() → ask()"],
  ["client", "model:      live, via createAskDb() + built-in openai provider (live/askdb.config.ts)"],
] as const)("[sqlite] lab-ui-live: asks the live model with the key, through the %s path", async ([via, modelLine], ctx) => {
  needsCapability(ctx, "cli-introspect-engine");
  if (via === "client") needsCapability(ctx, "client-built-in-providers");
  const before = liveStub.requests().length;

  const run = await liveRun({ question: AGENCY_NAMES, model: "live", via, engines: ["sqlite"] });
  const printed = column(run, "sqlite").lines.map((l) => l.text);

  expect(printed).toContain(modelLine);
  expect(printed.at(-1)).toBe("oracle:     pass");
  expect(run.summary?.oracle?.sqlite).toEqual({ verdict: "match" });
  expect(liveStub.requests().slice(before)).toEqual([expect.objectContaining({ question: AGENCY_NAMES, authorized: true })]);
});

it("[sqlite] lab-ui-live: a failed model call reaches the page with the key the provider echoed redacted", async (ctx) => {
  needsCapability(ctx, "cli-introspect-engine");
  needsCapability(ctx, "client-built-in-providers");

  const run = await liveRun({ question: SATO, model: "live", via: "client", engines: ["sqlite"] });
  const event = column(run, "sqlite");

  expect(event.status).toBe("refused");
  expect(event.lines.filter((l) => l.stream === "stderr").map((l) => l.text)).toEqual([expect.stringMatching(/^model call failed: SqlGenerationError: .*Incorrect API key provided: \[redacted\]/)]);
  expect(JSON.stringify(run)).not.toContain(STUB_KEY);
});

it.for([
  ["the parameterized question without its parameterized form", PROGRAMS_SINCE, /^oracle: {5}miss — no parameterized form/],
  ["a rejection, which has no rows", UNPAID, /^oracle: {5}miss — rejected \(SqlValidationError SQL_NOT_SELECT_OR_WITH\)$/],
] as const)("[sqlite] lab-ui-live: the summary's oracle verdict is the grader's, which checks more than the rows: %s", async ([, question, verdict], ctx) => {
  needsCapability(ctx, "cli-introspect-engine");

  const run = await liveRun({ question, model: "live", engines: ["sqlite"] });
  const printed = column(run, "sqlite").lines.map((l) => l.text);

  expect(printed.at(-1)).toMatch(verdict);
  expect(run.summary?.oracle?.sqlite).toEqual({ verdict: "mismatch", reason: printed.at(-1)!.replace(/^oracle: {5}miss — /, "") });
});
