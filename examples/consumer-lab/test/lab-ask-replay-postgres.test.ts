/**
 * `pnpm lab ask --db postgres "<catalog question>"`: the replay model, end to end, on Postgres,
 * through both documented model paths; and a question with no reply.
 *
 * Each dialect has its own `lab-ask-replay-<dialect>.test.ts`, so vitest runs them on different
 * workers. The scenario and its authoring-gate answers (Protects, Catches, Not covered elsewhere,
 * No production seam) are in `support/lab-ask-replay.ts`, which they share.
 *
 * Needs the fixture (`pnpm fixture:up`) and an installed lab (`pnpm lab:use .`).
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SUPPORTED_DIALECTS } from "../src/dialects.js";
import { LAB_ROOT } from "../src/paths.js";
import { describeLabAskReplay, labAsk } from "./support/lab-ask-replay.js";

describeLabAskReplay("postgres");

describe("lab-ask-replay files", () => {
  // A dialect added to the lab without its file would have no lab-ask-replay cells, and no FAIL.
  it("cover every supported dialect", () => {
    const missing = SUPPORTED_DIALECTS.filter((d) => !existsSync(join(LAB_ROOT, "test", `lab-ask-replay-${d}.test.ts`)));

    expect(missing).toEqual([]);
  });
});

describe("lab ask with no reply for the question", () => {
  it("fails, naming the catalog and the cassette to add, and runs nothing", async () => {
    const { status, out } = await labAsk("--db", "postgres", "Which agency has the most volunteers?");

    expect(out).toContain("contains none of the");
    expect(out).toContain("examples/consumer-lab/scenarios/questions.json");
    expect(out).toContain("examples/consumer-lab/cassettes/postgres/<id>.json");
    expect(out).not.toContain("validation:");
    expect(status).toBe(1);
  });
});
