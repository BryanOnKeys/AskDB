/**
 * Replay of verify-askdb's `introspect` feature (.agents/skills/verify-askdb/features/introspect.md).
 *
 * Protects: `askdb introspect` on SQLite from an installed-style project: writing the schema
 * folder from flags and from config, `--print`, `--diff` and `templates`.
 * Catches: the CLI losing the SQLite driver, config defaults or output modes end to end.
 * No production seam: it runs the built CLI on the Quickstart's shop.db.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AskdbRun } from "../run.js";

let run: AskdbRun;
beforeAll(async () => {
  run = await AskdbRun.create();
});
afterAll(async () => {
  await run?.cleanup();
});

describe("introspect", () => {
  it("introspect-write: writes schema.json with the three shop tables", () => {
    const result = run.cli(["introspect", "--engine", "sqlite", "--url", "shop.db", "--out", "askdb"], { label: "introspect-write" });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stderr).toContain("Wrote askdb/schema.json: 3 tables (sqlite).");
    const schema = JSON.parse(readFileSync(join(run.project, "askdb/schema.json"), "utf8"));
    expect(schema.tables.map((t: { id: string }) => t.id).sort()).toEqual(["table:public.customers", "table:public.orders", "table:public.products"]);
  });

  it("introspect-write (config defaults): takes engine, file and folder from askdb.config.ts", () => {
    const result = run.cli(["introspect"], { label: "introspect-config" });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stderr).toContain("Wrote askdb/schema.json: 3 tables (sqlite).");
  });

  it("introspect-print: prints schema JSON without writing a folder", () => {
    const result = run.cli(["introspect", "--engine", "sqlite", "--url", "shop.db", "--print"], { label: "introspect-print" });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).tables.some((t: { id: string }) => t.id === "table:public.customers")).toBe(true);
  });

  it("introspect-diff: reports an unchanged folder", () => {
    const result = run.cli(["introspect", "--engine", "sqlite", "--url", "shop.db", "--diff", "askdb"], { label: "introspect-diff" });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ changed: false, schemaJsonPath: "askdb/schema.json" });
  });

  it("introspect-templates: prints Postgres catalog SQL, and refuses an engine without templates", () => {
    const pg = run.cli(["introspect", "templates", "--engine", "postgres"], { label: "introspect-templates" });
    expect(pg.exitCode, pg.stderr).toBe(0);
    expect(pg.stdout).toContain("FROM pg_catalog.pg_namespace");

    const sqlite = run.cli(["introspect", "templates", "--engine", "sqlite"], { label: "introspect-templates-sqlite" });
    expect(sqlite.exitCode).toBe(1);
    expect(sqlite.stderr).toContain("'askdb introspect templates' is currently supported only for --engine postgres.");
  });
});
