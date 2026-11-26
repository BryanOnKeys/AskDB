/**
 * Replay of verify-askdb's `http-api` feature (.agents/skills/verify-askdb/features/http-api.md).
 *
 * Protects: `askdb-http` started from an installed-style project: `/health`, `POST /ask` with its
 * sensitive-guardrail result, the read-only refusal, the execute refusal and 404s.
 * Catches: the server's config, provider or response shape breaking end to end.
 * No production seam: it runs the built server against a fake OpenAI endpoint.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AskdbRun } from "../run.js";

let run: AskdbRun;
beforeAll(async () => {
  run = await AskdbRun.create();
  await run.start("api");
});
afterAll(async () => {
  await run?.cleanup();
});

describe("http-api", () => {
  it("api-health: answers ok", async () => {
    const res = await run.request("api", "GET", "/health", undefined, { label: "api-health" });
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ ok: true });
  });

  it("api-ask: returns the SQL, a correlation id and a passing sensitive guardrail", async () => {
    run.modelReply("SELECT id, email FROM users");
    const res = await run.request("api", "POST", "/ask", { question: "list users" }, { label: "api-ask" });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ ok: true, sql: "SELECT id, email FROM users", sensitiveGuardrail: { passed: true } });
    expect(res.json.correlationId).toEqual(expect.any(String));
    expect(run.modelRequests().at(-1)!.body).toContain("list users");
  });

  it("api-sensitive: reports the sensitive column without refusing", async () => {
    run.modelReply("SELECT id, secret_recovery_token FROM users");
    const res = await run.request("api", "POST", "/ask", { question: "tokens" }, { label: "api-sensitive" });
    expect(res.status).toBe(200);
    expect(res.json.sensitiveGuardrail.passed).toBe(false);
    expect(res.json.sensitiveGuardrail.references).toContainEqual(expect.objectContaining({ table: "users", column: "secret_recovery_token" }));
  });

  it("api-refuse-write: answers 400 sql_validation_error for a non-read-only reply", async () => {
    run.modelReply("DELETE FROM users");
    const res = await run.request("api", "POST", "/ask", { question: "delete users" }, { label: "api-refuse-write" });
    expect(res.status).toBe(400);
    expect(res.json).toMatchObject({ ok: false, error: { code: "sql_validation_error", rule: "SQL_NOT_SELECT_OR_WITH" } });
  });

  it("api-refuse-execute: answers 400 for an execute field", async () => {
    const res = await run.request("api", "POST", "/ask", { question: "x", execute: true }, { label: "api-refuse-execute" });
    expect(res.status).toBe(400);
    expect(res.json.error).toEqual({ code: "bad_request", message: "Execution is not supported. This endpoint returns generated SQL only." });
  });

  it("api-not-found: answers 404 for any other route", async () => {
    const res = await run.request("api", "GET", "/nope", undefined, { label: "api-not-found" });
    expect(res.status).toBe(404);
    expect(res.json.error.code).toBe("not_found");
  });
});
