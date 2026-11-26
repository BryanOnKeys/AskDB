/**
 * `pnpm lab ui` beside `pnpm lab ask`: one input run on every engine at once, one column per
 * engine, driven over HTTP the way its page drives it (`POST /api/run`, read back as NDJSON).
 * Each column is checked against what `lab ask` prints, and the summary strip's verdicts against
 * the engines' rows. The two scenarios share one run per input (`runOnce`), so they stay in one file.
 *
 * `lab ui`'s scenarios are split over the `lab-ui-*.test.ts` files, so vitest runs them on
 * different workers; what they share is in `support/lab-ui.ts`. The authoring-gate answers are
 * per scenario, above each group of tests. For all of them: No production seam: the tests start
 * the real `pnpm lab ui` command (through tsx's loader, as `pnpm lab` does) and the real
 * `pnpm lab ask`, and send the requests the page sends. Every `lab ui` here starts without a key
 * (`support/lab-ui.ts`), so none can ask the live model.
 *
 * Scenarios that run every engine have a cell per engine. The others don't depend on an engine
 * and run once, as `[postgres]`, as the Studio suite's protection scenarios do.
 *
 * Needs the `cli-introspect-engine` capability (every column builds a schema artifact), the
 * fixture (`pnpm fixture:up`) and an installed lab (`pnpm lab:use .`).
 */
import { afterAll, beforeAll, expect, it } from "vitest";
import { needsCapability } from "../src/capabilities.js";
import { SUPPORTED_DIALECTS, type SupportedDialect } from "../src/dialects.js";
import type { UiInput } from "../src/ui/server.js";
import {
  AGENCY_NAMES,
  DIALECTS,
  labAsk,
  maskPorts,
  NO_REPLY,
  printed,
  startLabUiProcess,
  TOP_PAID,
  uiRun,
  type LabUiProcess,
  type UiRun,
} from "./support/lab-ui.js";

let ui: LabUiProcess;
const runs = new Map<string, Promise<UiRun>>();
/** One `POST /api/run` per input, shared by the scenarios that read it. */
function runOnce(input: UiInput): Promise<UiRun> {
  const key = JSON.stringify(input);
  if (!runs.has(key)) runs.set(key, uiRun(ui, input));
  return runs.get(key)!;
}

beforeAll(async () => {
  ui = await startLabUiProcess();
});

afterAll(async () => {
  await ui?.close();
});

/*
 * Protects: `lab ask` and `lab ui` share one ask → validate → execute module, so an
 * engine's column holds exactly what `pnpm lab ask --db <engine>` prints for the same input
 * (issue #262): the SQL, the validation outcome or the rejecting error class and rule code,
 * the replay server's refusal, and the rows with their count, and the same exit code.
 * Catches: the page drifting into a second implementation: a column built from another
 * model path, prompt or formatter, a rejection or refusal reported differently, or rows
 * that aren't the ones `lab ask` reads.
 * Not covered elsewhere: `lab-ask` and `lab-ask-replay` check `lab ask`'s own output, and
 * nothing checks the page's columns against it.
 */
it.for(DIALECTS)("[%s] lab-ui-same-as-lab-ask: a catalog question", async ([dialect], ctx) => {
  needsCapability(ctx, "cli-introspect-engine");
  const [cli, run] = await Promise.all([labAsk("--db", dialect, TOP_PAID), runOnce({ question: TOP_PAID })]);

  expect(cli.status).toBe(0);
  expect(printed(run, dialect)).toEqual(maskPorts(cli));
});

/*
 * Protects: the page's path switch (#448): a column asked through the client path
 * (`createAskDb` + built-in `openai` provider) holds what `pnpm lab ask --via client` prints, on every
 * engine, so the page tests both documented model paths.
 * Catches: the client path's config read once for the whole server, so every engine after the
 * first asks the first engine's replay URL and gets its SQL; or a `via` the page sends that the
 * server drops, so the "client" column is the raw path's.
 * Not covered elsewhere: the raw-path scenario above; `lab-ask-replay` checks `lab ask --via
 * client` itself, not the page's columns.
 */
it.for(DIALECTS)("[%s] lab-ui-same-as-lab-ask: a catalog question through the client path", async ([dialect], ctx) => {
  needsCapability(ctx, "cli-introspect-engine");
  needsCapability(ctx, "client-built-in-providers");
  const [cli, run] = await Promise.all([labAsk("--db", dialect, "--via", "client", TOP_PAID), runOnce({ question: TOP_PAID, via: "client" })]);

  expect(cli.stdout).toContain("via createAskDb() + built-in openai provider");
  expect(cli.status).toBe(0);
  expect(printed(run, dialect)).toEqual(maskPorts(cli));
});

it.for([
  ["a rejected statement", { question: "", sql: "DELETE FROM org.agency" }, ["--sql", "DELETE FROM org.agency"]],
  ["a question with no reply", { question: NO_REPLY }, [NO_REPLY]],
] as const)("[postgres] lab-ui-same-as-lab-ask: %s", async ([, input, args], ctx) => {
  needsCapability(ctx, "cli-introspect-engine");
  const [cli, run] = await Promise.all([labAsk("--db", "postgres", ...args), runOnce(input)]);

  expect(cli.status).toBe(1);
  expect(printed(run, "postgres")).toEqual(maskPorts(cli));
});

/*
 * Protects: the summary strip's two verdicts (issue #262): whether the engines agree after
 * the fixture's normalization rules (`dataset/NORMALIZATION.md`), and whether each engine
 * matches the oracle computed from the seed data (`src/oracle.ts`), for a catalog question
 * and for raw SQL labelled with one.
 * Catches: an indicator that says "agree" when the engines' rows differ (comparing counts,
 * or skipping an engine), one that says "disagree" over driver-level differences the
 * normalization rules erase (MySQL's string integers, SQL Server's numbers), and an oracle
 * verdict that isn't per engine. The catalog question's paid totals are decimals, which
 * Postgres and MySQL return as strings and SQL Server and SQLite as numbers.
 * Not covered elsewhere: `results.test.ts` compares each engine with the oracle inside the
 * suite; nothing checks what the page tells a contributor.
 * The disagreement is real engine behavior: `LIKE 'a%'` is case-sensitive on Postgres and
 * case-insensitive under the other servers' default collations, so Postgres reads no rows
 * and MySQL, MariaDB and SQL Server read the three `Agência …` rows. SQLite has no `org`
 * schema, so its column reports its own error and it isn't compared.
 * Raw SQL labelled with a question it doesn't answer (three columns for a two-column
 * question) returns the same rows everywhere, so it's not compared rather than shown as a
 * disagreement, and the oracle calls each engine a mismatch.
 */
it.for(DIALECTS)("[%s] lab-ui-summary: every engine agrees and matches the oracle on a catalog question", async ([dialect], ctx) => {
  needsCapability(ctx, "cli-introspect-engine");
  const { summary } = await runOnce({ question: TOP_PAID });

  expect(summary?.questionId).toBe("top-paid-agencies");
  expect(summary?.agreement.verdict).toBe("agree");
  expect(summary?.agreement.groups.map((g) => g.slice().sort())).toEqual([[...SUPPORTED_DIALECTS].sort()]);
  expect(summary?.oracle?.[dialect]).toEqual({ verdict: "match" });
});

const LIKE_SQL = "SELECT agency_id, name FROM org.agency WHERE name LIKE 'a%' ORDER BY agency_id";
const CASE_INSENSITIVE: SupportedDialect[] = ["mariadb", "mysql", "sqlserver"];
const DISAGREEMENT: Record<SupportedDialect, { group?: SupportedDialect[]; oracle: string }> = {
  postgres: { group: ["postgres"], oracle: "mismatch" },
  mysql: { group: CASE_INSENSITIVE, oracle: "mismatch" },
  mariadb: { group: CASE_INSENSITIVE, oracle: "mismatch" },
  sqlserver: { group: CASE_INSENSITIVE, oracle: "mismatch" },
  sqlite: { oracle: "not compared" },
};

it.for(DIALECTS)("[%s] lab-ui-summary: engines that read different rows are shown disagreeing", async ([dialect], ctx) => {
  needsCapability(ctx, "cli-introspect-engine");
  const { summary } = await runOnce({ sql: LIKE_SQL, question: AGENCY_NAMES });
  const want = DISAGREEMENT[dialect];

  expect(summary?.agreement.verdict).toBe("disagree");
  if (want.group) expect(summary?.agreement.groups.find((g) => g.includes(dialect))?.slice().sort()).toEqual(want.group);
  else expect(summary?.agreement.notCompared).toEqual([{ dialect, reason: "failed" }]);
  expect(summary?.oracle?.[dialect]?.verdict).toBe(want.oracle);
});

it.for(DIALECTS)("[%s] lab-ui-summary: rows that don't fit the labelled question aren't compared, not shown disagreeing", async ([dialect], ctx) => {
  needsCapability(ctx, "cli-introspect-engine");
  const { summary } = await runOnce({ sql: "SELECT 1 AS a, 2 AS b, 3 AS c", question: AGENCY_NAMES });

  expect(summary?.agreement.verdict).toBe("not compared");
  expect(summary?.agreement.notCompared.find((n) => n.dialect === dialect)?.reason).toMatch(/^rows don't fit the question's columns/);
  expect(summary?.oracle?.[dialect]?.verdict).toBe("mismatch");
});
