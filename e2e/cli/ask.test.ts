/**
 * Replay of verify-askdb's `ask-cli` feature (.agents/skills/verify-askdb/features/ask-cli.md).
 *
 * Protects: `askdb ask` in an installed-style project, from config to provider to stdout: the SQL
 * after `-- sql --`, the read-only refusal, the sensitive warning, `--explain` and `--mock-sql`.
 * Catches: a break anywhere on that path (config loading, the provider call over HTTP, prompt
 * building, output format) that unit tests reach only one layer at a time.
 * No production seam: it runs the built CLI against a fake OpenAI endpoint.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type AskdbRun, introspectedRun } from "../run.js";

let run: AskdbRun;
beforeAll(async () => {
  run = await introspectedRun();
});
afterAll(async () => {
  await run?.cleanup();
});

describe("ask-cli", () => {
  it("ask-generate: prints the model's SQL, after the question and schema reach the model", () => {
    const sql = "SELECT c.name, SUM(o.quantity) AS units FROM customers c JOIN orders o ON o.customer_id = c.id GROUP BY c.name ORDER BY units DESC";
    run.modelReply(sql);
    const result = run.cli(["ask", "--question", "Which customers bought the most units?"], { label: "ask-generate" });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toBe(`-- sql --\n${sql}\n`);

    const prompt = run.modelRequests({ label: "ask-generate-prompt" }).at(-1)!.body;
    expect(prompt).toContain("Which customers bought the most units?");
    expect(prompt).toContain("customers");
  });

  it("ask-refuse-write: refuses a non-read-only reply with exit 1", () => {
    run.modelReply("DELETE FROM orders");
    const result = run.cli(["ask", "--question", "remove all orders"], { label: "ask-refuse-write" });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/^SqlValidationError \[SQL_NOT_SELECT_OR_WITH\]: SQL must start with SELECT or WITH \(got 'delete'\)\./);
    expect(result.stderr).toContain("Hint:");
  });

  it("ask-sensitive-warning: warns on stderr about a sensitive column and still exits 0", () => {
    run.modelReply("SELECT id, secret_recovery_token FROM users");
    const result = run.cli(["ask", "--schema", "schemas/orders-users-sensitive.schema", "--question", "recovery tokens"], { label: "ask-sensitive-warning" });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain("SELECT id, secret_recovery_token FROM users");
    expect(result.stderr).toContain("Warning: generated SQL references sensitive columns: public.users.secret_recovery_token");
    expect(result.stderr).toContain("Review carefully before sharing or running this SQL.");
  });

  it("ask-explain: adds an explain block listing the checks that ran", () => {
    run.modelReply("SELECT name FROM customers");
    const result = run.cli(["ask", "--question", "customer names", "--explain"], { label: "ask-explain" });
    expect(result.exitCode, result.stderr).toBe(0);
    const [sqlPart, explainPart] = result.stdout.split("-- explain --\n");
    expect(sqlPart).toBe("-- sql --\nSELECT name FROM customers\n");
    expect(JSON.parse(explainPart!).checksVerified).toContain("leading_select_or_with");
  });

  it("ask-mock-sql: takes SQL from --mock-sql without calling the model, and still validates it", () => {
    const before = run.modelRequests().length;
    const ok = run.cli(["ask", "--question", "anything", "--mock-sql", "SELECT 1"], { label: "ask-mock-sql" });
    expect(ok.exitCode, ok.stderr).toBe(0);
    expect(ok.stdout).toBe("-- sql --\nSELECT 1\n");
    expect(run.modelRequests().length).toBe(before);

    const refused = run.cli(["ask", "--question", "anything", "--mock-sql", "DROP TABLE orders"], { label: "ask-mock-sql-drop" });
    expect(refused.exitCode).toBe(1);
    expect(refused.stderr).toContain("SqlValidationError");
  });
});
