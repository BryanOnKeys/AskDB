import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getAskDbRuntimeConfig } from "./runtime-config.js";
import { setAskDbRuntimeForTests } from "./runtime-store.js";
import type { AskDbConfig } from "./types.js";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Make `@askdb/config` resolvable from `projectDir`, so a test can write an `askdb.config.*` there
 * and load it the way a user's project does. jiti compiles a TypeScript config, and the package's
 * source with it. Node loads a JavaScript config and its imports itself, so `built` links `dist`
 * instead, as an install does; the test task builds the package first.
 */
export function linkWorkspacePackage(projectDir: string, { built = false }: { built?: boolean } = {}): void {
  const nmAskdb = join(projectDir, "node_modules", "@askdb");
  mkdirSync(nmAskdb, { recursive: true });
  const linkedPackage = join(nmAskdb, "config");
  mkdirSync(linkedPackage, { recursive: true });
  const folder = built ? "dist" : "src";
  const entry = built ? "./dist/index.js" : "./src/index.ts";
  symlinkSync(join(pkgRoot, folder), join(linkedPackage, folder), "dir");
  writeFileSync(
    join(linkedPackage, "package.json"),
    JSON.stringify({ name: "@askdb/config", type: "module", main: entry, exports: { ".": entry } }, null, 2),
    "utf8",
  );
}

/**
 * Every value the resolved runtime view holds, as one string: the flat map and the typed sections
 * (`ai.language.connection.apiKey`, …), but not `structured`, the config as authored. A value
 * found here was read by the resolver, not just carried along. Installs `config` as the runtime.
 */
export function resolvedRuntimeText(config: AskDbConfig): string {
  setAskDbRuntimeForTests(config);
  const { structured: _authored, ...resolved } = getAskDbRuntimeConfig();
  return JSON.stringify(resolved);
}

const repoRoot = join(pkgRoot, "..", "..");

/** The `askdb.config.ts` files git tracks under `examples/`, repo-relative and sorted. */
export function trackedExampleConfigs(): string[] {
  return execFileSync("git", ["ls-files", "-z", "--", "examples/**/askdb.config.ts"], { cwd: repoRoot, encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
    .sort();
}

/** Absolute path of a repo-relative file. */
export function repoPath(relative: string): string {
  return join(repoRoot, relative);
}

/**
 * A stand-in for every env var the example configs read. Each is realistic enough for the checks on
 * its value and distinct from any default an example falls back to, so a test can tell whether it
 * was read. None is a real secret.
 */
export const EXAMPLE_ENV_PLACEHOLDERS: Readonly<Record<string, string>> = {
  DATABASE_URL: "postgres://localhost:5432/placeholder_db",
  LAB_LIVE_MODEL_ID: "placeholder-live-model",
  LAB_REPLAY_BASE_URL: "http://127.0.0.1:4010/placeholder/v1",
  OPENAI_API_KEY: "sk-placeholder",
  OPENAI_EMBEDDING_MODEL: "placeholder-embedding-model",
  OPENAI_MODEL: "placeholder-model",
  SCHEMA_PATH: "./placeholder-schema",
};

/** The env var names a config file reads through `env("…")`, `process.env.…` or destructuring. */
export function envNamesRead(source: string): string[] {
  const name = /^[A-Z][A-Z0-9_]*$/;
  const names = [
    ...[...source.matchAll(/\benv\(\s*["'`]([A-Z][A-Z0-9_]*)["'`]\s*\)/g)].map((m) => m[1]!),
    ...[...source.matchAll(/\bprocess\.env\.([A-Z][A-Z0-9_]*)/g)].map((m) => m[1]!),
    ...[...source.matchAll(/\bprocess\.env\[\s*["'`]([A-Z][A-Z0-9_]*)["'`]\s*\]/g)].map((m) => m[1]!),
    ...[...source.matchAll(/\{([^{}]*)\}\s*=\s*process\.env\b/g)].flatMap((m) =>
      m[1]!.split(",").map((part) => part.split(/[:=]/)[0]!.trim()),
    ),
  ].filter((n) => name.test(n));
  return [...new Set(names)].sort();
}

/** {@link envNamesRead} for a tracked example config. */
export function exampleEnvNames(example: string): string[] {
  return envNamesRead(readFileSync(repoPath(example), "utf8"));
}
