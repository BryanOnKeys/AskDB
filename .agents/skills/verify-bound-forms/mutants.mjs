#!/usr/bin/env node
// Show the bound-forms check can still fail: apply each scratch break to @askdb/core's source,
// rebuild, run the check, and put the file back exactly as it was (uncommitted edits survive).
//   node .agents/skills/verify-bound-forms/mutants.mjs      # every break
//   node .agents/skills/verify-bound-forms/mutants.mjs 3    # one break, by number
// Prints `caught`, `MISSED` or `NO LONGER APPLIES` per break; exits 1 unless every break is caught.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: dirname(fileURLToPath(import.meta.url)), encoding: "utf8" }).trim();

/** Each break turns off one thing the property guards. Keep `old` exact: it must occur once. */
const BREAKS = [
  {
    file: "packages/core/src/sql/checked-statement.ts",
    old: 'if (style !== "question") {',
    new: 'if (style !== ("question" as string) || business.length >= 0) {',
    what: "tenant values appended after the business values on ? dialects",
  },
  {
    file: "packages/core/src/sql/checked-statement.ts",
    old: "const k = seen.get(occ.name) ?? 0;",
    new: "const k = 0;",
    what: "every occurrence of a repeated placeholder takes the first occurrence's slots",
  },
  {
    file: "packages/core/src/sql/tenant-placeholders.ts",
    old: "    const r = byPlaceholder.get(occ.placeholder);",
    new: "    const r = resolved[0] ?? byPlaceholder.get(occ.placeholder);",
    what: "the first tenant root's IDs render into every tenant placeholder",
  },
  {
    file: "packages/core/src/sql/bind.ts",
    old: `let escaped = value.replace(/'/g, "''");`,
    new: `let escaped = value.replace(/'/, "''");`,
    what: "only the first quote in a string literal is doubled",
  },
  {
    file: "packages/core/src/sql/bind.ts",
    old: '    if (span.kind !== "code") continue;\n    const segment',
    new: "    const segment",
    what: "placeholders are read inside string literals too",
  },
  {
    file: "packages/core/src/sql/tenant-placeholders.ts",
    old: "const INLINABLE_TENANT_ID = /^[\\x20-\\x5b\\x5d-\\x7e]*$/;",
    new: "const INLINABLE_TENANT_ID = /^[\\x20-\\x7e]*$/;",
    what: "sql-only inlines a tenant ID that holds a backslash",
  },
];

function buildCore() {
  // tsc still emits when a break doesn't typecheck, so the break lands in dist either way.
  spawnSync("pnpm", ["exec", "turbo", "run", "build", "--filter=@askdb/core", "--output-logs=none"], { cwd: root, stdio: "ignore" });
}

function checkPasses() {
  const run = spawnSync("pnpm", ["exec", "vitest", "run", "--config", "../../vitest.config.ts", "src/verification/bound-forms-agree.test.ts"], {
    cwd: join(root, "packages/sqlite"),
    stdio: "ignore",
  });
  return run.status === 0;
}

const only = process.argv[2] === undefined ? undefined : Number(process.argv[2]);
let ok = true;
for (const [i, brk] of BREAKS.entries()) {
  const n = i + 1;
  if (only !== undefined && only !== n) continue;
  const path = join(root, brk.file);
  const original = readFileSync(path, "utf8");
  if (original.split(brk.old).length !== 2) {
    console.log(`break ${n}: NO LONGER APPLIES (${brk.file} changed): ${brk.what}`);
    ok = false;
    continue;
  }
  try {
    writeFileSync(path, original.replace(brk.old, brk.new));
    buildCore();
    const caught = !checkPasses();
    console.log(`break ${n}: ${caught ? "caught" : "MISSED"}: ${brk.what}`);
    ok &&= caught;
  } finally {
    writeFileSync(path, original);
  }
}
buildCore();
process.exit(ok ? 0 : 1);
