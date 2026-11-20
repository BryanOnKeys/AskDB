/**
 * The `lab-ask-replay` scenario for one dialect: `pnpm lab ask --db <dialect> "<catalog question>"`,
 * the replay model end to end, through both documented model paths. Each dialect's file
 * (`test/lab-ask-replay-<dialect>.test.ts`) calls `describeLabAskReplay`, so vitest runs the
 * dialects on different workers.
 *
 * Protects: with no API key, each catalog question goes from the question through packed
 * AskDB (prompt, model call, extraction, validation) to rows executed on the fixture, on
 * all five dialects. The raw-model path (a `createOpenAI({ baseURL })` model passed to
 * `ask()`) and the adapter path (`createAskDb` with its built-in `openai` provider, configured by
 * `providerConfig.openai.baseUrl`) send the model the same prompt, and return the same
 * SQL, which is the cassette's. A question with no reply fails loudly, saying how to add
 * one.
 * Catches: a packed `@askdb/core` that rejects valid dialect syntax (backticks, brackets,
 * `TOP`, the quoted reserved-word table `order`), extraction that mangles a model reply,
 * config-driven model or baseUrl resolution in `@askdb/client`/`@askdb/ai` that
 * drifts from the raw path, and a replay miss that passes silently. Both paths are given
 * the dialect explicitly (`ask({ dialect })`, `createAskDb({ dialect })`), so this checks
 * only that the client's documented `dialect` option wins over the artifact's recorded
 * provider (MariaDB's artifact records `mysql`, which changes the prompt). It doesn't
 * test the client inferring a dialect from the artifact.
 * Not covered elsewhere: the client and adapter unit tests mock the AI SDK; core's tests
 * use workspace source and never call a model over HTTP or run the SQL on an engine.
 * No production seam: both model paths are the documented ones; the replay server is
 * lab code speaking the public OpenAI protocol.
 *
 * Needs the fixture (`pnpm fixture:up`) and an installed lab (`pnpm lab:use .`).
 */
import { availableParallelism } from "node:os";
import { beforeAll, describe, expect, it } from "vitest";
import { needsCapability } from "../../src/capabilities.js";
import type { SupportedDialect } from "../../src/dialects.js";
import { loadQuestions } from "../../src/model/catalog.js";
import { expectCassetteSql } from "./cassette-sql.js";
import { runLab } from "./lab-cli.js";

const QUESTIONS = loadQuestions();

export interface AskRun {
  status: number | null;
  /** stdout and stderr together, in the order they arrived. */
  out: string;
}

/** `pnpm lab ask <args>`. */
export async function labAsk(...args: string[]): Promise<AskRun> {
  const { status, output } = await runLab(["ask", ...args]);
  return { status, out: output };
}

/**
 * Each `lab ask` is a Node process that loads AskDB and a database driver. A dialect's file starts
 * at most this many at once, so the dialects' files, run side by side, don't starve each other
 * (and the other files' processes) of CPU.
 */
const AT_ONCE = Math.max(2, availableParallelism());

/** `fn` on every item, at most `limit` at a time. */
async function eachLimited<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]!);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/**
 * The SQL `lab ask` printed: from `sql:` up to the next label (`unbound:` for parameterized
 * output, else `validation:`), continuation indent removed.
 */
function printedSql(out: string): string | undefined {
  const match = /^sql: {8}([\s\S]*?)\n(?:unbound|validation):/m.exec(out);
  return match?.[1]!.replace(/\n {12}/g, "\n");
}

/** The digest `lab ask` printed of the prompt the replay server received. */
function printedPrompt(out: string): string | undefined {
  return /^prompt: {5}(.+)$/m.exec(out)?.[1];
}

/** `[<dialect>] lab-ask-replay`: every catalog question, through both model paths. */
export function describeLabAskReplay(dialect: SupportedDialect): void {
  describe(`[${dialect}] lab-ask-replay`, () => {
    const runs = new Map<string, { raw: AskRun; client: AskRun }>();

    beforeAll(async () => {
      const asks = QUESTIONS.flatMap((q) => [
        { id: q.id, via: "raw" as const, args: ["--db", dialect, q.text] },
        { id: q.id, via: "client" as const, args: ["--db", dialect, "--via", "client", q.text] },
      ]);
      const done = new Map<string, AskRun>();
      await eachLimited(asks, AT_ONCE, async (a) => void done.set(`${a.id} ${a.via}`, await labAsk(...a.args)));
      for (const q of QUESTIONS) runs.set(q.id, { raw: done.get(`${q.id} raw`)!, client: done.get(`${q.id} client`)! });
    });

    it.each(QUESTIONS.map((q) => [q.id]))("answers %s with validated SQL and rows", (id) => {
      const { raw } = runs.get(id)!;

      expect(raw.out).toContain("validation: ok");
      expect(raw.out).toMatch(/^\d+ rows?$/m);
      expect(raw.status).toBe(0);
    });

    it("returns every agency, unicode names intact", () => {
      const { raw } = runs.get("agency-names")!;

      expect(raw.out).toContain("東京オフィス");
      expect(raw.out).toContain("Agência São Paulo");
      expect(raw.out).toMatch(/^7 rows$/m);
    });

    it.for(QUESTIONS.map((q) => [q.id] as const))("sends the same prompt and returns the cassette's SQL for %s through both model paths", ([id], ctx) => {
      needsCapability(ctx, "client-built-in-providers");
      const { raw, client } = runs.get(id)!;

      expect(client.status).toBe(0);
      expect(printedPrompt(raw.out)).toBeDefined();
      expect(printedPrompt(client.out)).toBe(printedPrompt(raw.out));
      expectCassetteSql(printedSql(raw.out), dialect, id);
      expect(printedSql(client.out)).toBe(printedSql(raw.out));
    });
  });
}
