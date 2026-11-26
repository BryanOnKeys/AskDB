/**
 * Replay of the API steps of verify-askdb's `studio-playground` feature
 * (.agents/skills/verify-askdb/features/studio-playground.md). The UI steps are playground.spec.ts.
 *
 * Protects: the endpoints the Playground calls (`/api/ask`, `/api/execute/status`, `/api/execute`)
 * with the page's token and Origin, and the refusal of a call without the token.
 * Catches: Studio's server losing execute (the SQLite driver resolved from the project) or its guard.
 * No production seam: it runs the built Studio against a fake OpenAI endpoint.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type AskdbRun, introspectedRun } from "../run.js";

const SQL = "SELECT name, country FROM customers ORDER BY name";
let run: AskdbRun;
beforeAll(async () => {
  run = await introspectedRun();
  run.modelReply(SQL);
  await run.start("studio", "askdb");
});
afterAll(async () => {
  await run?.cleanup();
});

describe("studio-playground (API)", () => {
  it("studio-generate: /api/ask returns the reply's SQL and the checks that ran", async () => {
    const res = await run.request("studio", "POST", "/api/ask", { question: "customers by name", mode: "full" }, { label: "studio-api-ask" });
    expect(res.status).toBe(200);
    expect(res.json.sql).toBe(SQL);
    expect(res.json.explain.checksVerified).toContain("leading_select_or_with");
  });

  it("studio-execute: runs the SQL read-only against shop.db", async () => {
    const status = await run.request("studio", "GET", "/api/execute/status", undefined, { label: "studio-api-execute-status" });
    expect(status.json).toMatchObject({ enabled: true, configured: true, installed: true, provider: "sqlite" });

    const res = await run.request("studio", "POST", "/api/execute", { sql: SQL }, { label: "studio-api-execute" });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ ok: true, columns: ["name", "country"], rowCount: 4 });
    expect(res.json.rows).toEqual([["Ada", "UK"], ["Grace", "US"], ["Linus", "FI"], ["Margaret", "US"]]);
  });

  it("studio-guard: refuses an API call without the session token", async () => {
    const res = await fetch(`${run.url("studio")}/api/workspace`);
    expect(res.status).toBe(403);
  });
});
