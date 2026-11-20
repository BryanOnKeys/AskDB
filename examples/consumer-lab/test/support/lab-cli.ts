/**
 * `pnpm lab <args>` as a child process, without pnpm: one Node process that runs
 * `src/lab-cli.ts` with tsx's loader, from the lab's root.
 *
 * `pnpm --silent lab` starts pnpm, a shell for the script, tsx's CLI, and only then the Node
 * process that runs the CLI, which tsx's CLI starts with `--require tsx/preflight --import tsx`.
 * The tests here start that last process directly, with the same flags, the same working
 * directory and the caller's environment. pnpm with `--silent` printed nothing of its own and
 * passed the CLI's exit code through, so the output and the exit code are the CLI's either way.
 * The environment differs only by the `npm_*` variables and the `node_modules/.bin` on `PATH`
 * that pnpm adds, which the CLI doesn't read: it runs `askdb` by its path (`src/introspect.ts`).
 * `lab ui`'s engine workers inherit these flags (`execArgv`), as they inherited tsx's.
 */
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { LAB_ROOT } from "../../src/paths.js";

const fromLab = createRequire(join(LAB_ROOT, "package.json"));

/** The flags tsx's CLI starts its Node process with (`tsx/dist/cli.mjs`), resolved from the lab's tsx. */
const TSX_NODE_FLAGS = ["--require", fromLab.resolve("tsx/preflight"), "--import", pathToFileURL(fromLab.resolve("tsx")).href];

/** The command that runs `pnpm lab <args>`'s CLI: `bin` and `args` for `spawn`, from `LAB_ROOT`. */
export function labCliCommand(args: readonly string[]): { bin: string; args: string[] } {
  return { bin: process.execPath, args: [...TSX_NODE_FLAGS, "src/lab-cli.ts", ...args] };
}

export interface CliRun {
  /** The exit code, or null when the process was killed. */
  status: number | null;
  stdout: string;
  stderr: string;
  /** stdout and stderr together, in the order they arrived. */
  output: string;
}

export interface LabCliOptions {
  /** Added to this process's environment. */
  env?: Record<string, string>;
  /**
   * Kill the CLI, and every process it started, if it's still running after this many
   * milliseconds; it then has status null. The CLI runs in its own process group for that.
   */
  killAfterMs?: number;
}

/** Run `pnpm lab <args>`'s CLI to completion. */
export function runLab(args: readonly string[], { env, killAfterMs }: LabCliOptions = {}): Promise<CliRun> {
  const command = labCliCommand(args);
  return new Promise((resolve, reject) => {
    const child = spawn(command.bin, command.args, {
      cwd: LAB_ROOT,
      env: env && { ...process.env, ...env },
      detached: killAfterMs !== undefined,
    });
    const timer = killAfterMs === undefined ? undefined : setTimeout(() => process.kill(-child.pid!, "SIGKILL"), killAfterMs);
    let stdout = "";
    let stderr = "";
    let output = "";
    child.stdout.on("data", (d) => {
      stdout += d;
      output += d;
    });
    child.stderr.on("data", (d) => {
      stderr += d;
      output += d;
    });
    child.on("error", reject);
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr, output });
    });
  });
}

/** `runLab`, blocking: for tests that run one command at a time. */
export function runLabSync(args: readonly string[], { env }: Pick<LabCliOptions, "env"> = {}): Omit<CliRun, "output"> {
  const command = labCliCommand(args);
  const run = spawnSync(command.bin, command.args, { cwd: LAB_ROOT, encoding: "utf8", env: env && { ...process.env, ...env } });
  if (run.error) throw run.error;
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}
