/**
 * Replay of verify-askdb's `init` feature (.agents/skills/verify-askdb/features/init.md).
 *
 * Protects: `askdb init --yes` writing a SQLite config and `.env.example`, printing next steps,
 * and refusing to overwrite without `--force`.
 * Catches: a non-interactive init that writes the wrong config, or overwrites a user's file.
 * No production seam: it runs the built CLI in a scratch project.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AskdbRun } from "../run.js";

const INIT = ["init", "--yes", "--path", "init-check/askdb.config.ts", "--database", "sqlite", "--sqlite-file", "./shop.db", "--skip-install", "--no-studio-execute"];
let run: AskdbRun;
beforeAll(async () => {
  run = await AskdbRun.create();
  mkdirSync(join(run.project, "init-check"));
});
afterAll(async () => {
  await run?.cleanup();
});

describe("init", () => {
  it("init-write and init-next-steps: writes the config and .env.example, then prints next steps", () => {
    const result = run.cli(INIT, { label: "init-write" });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain("Wrote:");
    expect(result.stdout).toContain("init-check/askdb.config.ts");
    expect(result.stdout).toContain("init-check/.env.example");
    expect(result.stdout).toContain("Next steps:");

    const config = readFileSync(join(run.project, "init-check/askdb.config.ts"), "utf8");
    expect(config).toContain('from "@askdb/config"');
    expect(config).toMatch(/provider: "sqlite"/);
    expect(config).toContain('file: "./shop.db"');
    expect(config).toContain('env("OPENAI_API_KEY")');
  });

  it("init-refuse-overwrite: refuses an existing config unless --force", () => {
    const path = join(run.project, "init-check/askdb.config.ts");
    const before = readFileSync(path, "utf8");
    const refused = run.cli(INIT, { label: "init-refuse-overwrite" });
    expect(refused.exitCode).toBe(1);
    expect(refused.stderr).toContain("Use `askdb init --force` to overwrite.");
    expect(readFileSync(path, "utf8")).toBe(before);

    const forced = run.cli([...INIT, "--force"], { label: "init-force" });
    expect(forced.exitCode, forced.stderr).toBe(0);
  });
});
