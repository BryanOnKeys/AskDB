// @ts-check
// One verification run of AskDB: a disposable project with its own config, the Quickstart's
// shop.db, copies of the schema fixtures and a fake OpenAI endpoint, driven through the built
// CLI, HTTP API and Studio. Every drive writes an evidence file that cleanup keeps.
//
// The replay tests (e2e/cli, e2e/api, e2e/studio) and the agent's CLI (control-askdb.mjs) both
// drive AskDB through this module, so a scripted journey and an agent-driven one start from the
// same state. The playbook that explains it is .agents/skills/verify-askdb/SKILL.md.
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, cpSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const e2eDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repo = resolve(e2eDir, "..");
/** Package folders, through e2e's own dependencies (pnpm links each into e2e/node_modules). */
const pkgDir = (/** @type {string} */ name) => realpathSync(join(e2eDir, "node_modules", name));

export const CLI = join(pkgDir("askdb"), "dist/cli.js");
export const HTTP_API = join(pkgDir("@askdb/http-api"), "dist/bin.js");
const STUDIO_CLIENT = join(pkgDir("@askdb/studio"), "dist/client/index.html");

/** Where runs live: ASKDB_VERIFY_ROOT, or <os tmpdir>/askdb-verify. */
export function verifyRoot() {
  return process.env.ASKDB_VERIFY_ROOT ?? join(tmpdir(), "askdb-verify");
}

/** The run `setup` last made from this checkout, so agent commands in separate shells find it. */
export function currentRunFile() {
  return join(verifyRoot(), `current-${createHash("sha256").update(repo).digest("hex").slice(0, 12)}`);
}

/** @typedef {{ pid: number, marker: string, log: string }} Proc */
/** @typedef {{ id: string, live: boolean, ports: { model: number, api: number, studio: number }, project: string, evidence: string }} RunState */
/** @typedef {{ command: string[], cwd: string, exitCode: number | null, stdout: string, stderr: string, evidence: string }} CliResult */
/** @typedef {{ status: number, json: any, text: string, evidence: string }} HttpResult */

async function freePort() {
  return new Promise((resolvePort, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      const port = typeof address === "object" && address ? address.port : 0;
      srv.close(() => resolvePort(port));
    });
  });
}

/** Command line of `pid`, or undefined when it isn't running. */
/** @param {number} pid */
function commandOf(pid) {
  const ps = spawnSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" });
  return ps.status === 0 ? ps.stdout.trim() : undefined;
}

/** Whether `proc` is still the process the run started: alive, with its command line naming `marker`. */
/** @param {Proc | undefined} proc */
export function isOurs(proc) {
  if (!proc?.pid) return false;
  const cmd = commandOf(proc.pid);
  return cmd !== undefined && cmd.includes(proc.marker);
}

/**
 * The workspace packages a run executes: e2e's dependencies and, through workspace links, theirs
 * (dependencies, optional and peer; devDependencies only for e2e itself). Derived from the
 * manifests, so a package the CLI or Studio comes to depend on is covered without an edit here.
 * @returns {string[]} absolute package folders
 */
export function workspaceClosure() {
  /** @type {Set<string>} */
  const seen = new Set();
  const queue = [e2eDir];
  while (queue.length > 0) {
    const dir = /** @type {string} */ (queue.shift());
    const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    const names = Object.keys({
      ...manifest.dependencies,
      ...manifest.optionalDependencies,
      ...manifest.peerDependencies,
      ...(dir === e2eDir ? manifest.devDependencies : {}),
    });
    for (const name of names) {
      const link = join(dir, "node_modules", name);
      if (!existsSync(link)) continue;
      const target = realpathSync(link);
      if (!target.startsWith(repo + sep) || target.includes(`${sep}node_modules${sep}`) || seen.has(target)) continue;
      seen.add(target);
      queue.push(target);
    }
  }
  return [...seen].sort();
}

const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));

export class AskdbRun {
  /** @param {string} id @param {RunState} state */
  constructor(id, state) {
    this.id = id;
    this.state = state;
    this.dir = join(verifyRoot(), id);
  }

  get project() { return this.state.project; }
  get evidence() { return this.state.evidence; }
  /** @param {"api" | "studio" | "model"} kind */
  url(kind) { return `http://127.0.0.1:${this.state.ports[kind]}`; }

  /**
   * A new run. Throws when a build is missing or the id is taken.
   * @param {{ id?: string, live?: boolean }} [options]
   */
  static async create({ id, live = false } = {}) {
    for (const built of [CLI, HTTP_API, STUDIO_CLIENT]) {
      if (!existsSync(built)) throw new Error(`${built} is missing. Build first: pnpm exec turbo run build --filter=@askdb/e2e^...`);
    }
    const runId = id ?? `v${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}-${randomBytes(2).toString("hex")}`;
    const dir = join(verifyRoot(), runId);
    const project = join(dir, "project");
    const evidence = join(dir, "evidence");
    if (existsSync(project)) throw new Error(`run ${runId} already has a project at ${project}: pick a new id, or clean it up first.`);
    mkdirSync(project, { recursive: true });
    mkdirSync(evidence, { recursive: true });

    // Verification scaffolding: what an installed project resolves from its own node_modules.
    mkdirSync(join(project, "node_modules/@askdb"), { recursive: true });
    symlinkSync(pkgDir("@askdb/config"), join(project, "node_modules/@askdb/config"));
    symlinkSync(pkgDir("better-sqlite3"), join(project, "node_modules/better-sqlite3"));

    // The Quickstart's shop database, and copies of the schema fixtures (Studio writes into its schema folder).
    const Database = require("better-sqlite3");
    const db = new Database(join(project, "shop.db"));
    db.exec(readFileSync(join(repo, "examples/quickstart-shop/shop.sql"), "utf8"));
    db.close();
    for (const fixture of ["orders-users-sensitive.schema", "agency-multi-tenant.schema"]) {
      cpSync(join(repo, "fixtures/schemas", fixture), join(project, "schemas", fixture), { recursive: true });
    }

    const ports = { model: await freePort(), api: await freePort(), studio: await freePort() };
    const ai = live
      ? `{ provider: "openai", providerConfig: { openai: { apiKey: env("OPENAI_API_KEY") } }, language: { model: env("OPENAI_MODEL") } }`
      : `{ provider: "openai", providerConfig: { openai: { apiKey: "sk-verify", baseUrl: "http://127.0.0.1:${ports.model}/v1" } }, language: { model: "gpt-4o-mini" } }`;
    writeFileSync(
      join(project, "askdb.config.ts"),
      `import { defineConfig, env } from "@askdb/config";
// Written by the verify-askdb harness (e2e/harness/askdb-run.mjs) for run ${runId}.
export default defineConfig({
  ai: ${ai},
  introspection: { provider: "sqlite", providerConfig: { sqlite: { file: "./shop.db" } }, outputDir: "./askdb" },
  rag: { embedder: "mock", store: "file", storeConfig: { file: {} } },
  studio: { listen: { host: "127.0.0.1", port: ${ports.studio} }, execute: { enabled: true, provider: "sqlite", file: "./shop.db" } },
  httpApi: { listen: { host: "127.0.0.1", port: ${ports.api} } },
});
`,
    );
    if (live && existsSync(join(repo, ".env"))) cpSync(join(repo, ".env"), join(project, ".env"));

    const run = new AskdbRun(runId, { id: runId, live, ports, project, evidence });
    run.save();
    if (!live) run.setProcess("model", await run.startProcess("model", [join(e2eDir, "harness/fake-openai.mjs"), dir, String(ports.model)], "fake-openai listening"));
    return run;
  }

  /** @param {string} id */
  static load(id) {
    const file = join(verifyRoot(), id, "state.json");
    if (!existsSync(file)) throw new Error(`run ${id} has no state at ${file}: create it first.`);
    return new AskdbRun(id, JSON.parse(readFileSync(file, "utf8")));
  }

  save() {
    writeFileSync(join(this.dir, "state.json"), JSON.stringify(this.state, null, 2) + "\n");
  }

  /**
   * The processes this run started, read fresh from one `proc-<kind>.json` file each, so two
   * commands starting or stopping different kinds at once never drop each other's record.
   * @returns {Record<string, Proc>}
   */
  processes() {
    /** @type {Record<string, Proc>} */
    const out = {};
    for (const f of existsSync(this.dir) ? readdirSync(this.dir) : []) {
      const kind = /^proc-(.+)\.json$/.exec(f)?.[1];
      if (kind) out[kind] = JSON.parse(readFileSync(join(this.dir, f), "utf8"));
    }
    return out;
  }

  /** @param {string} kind @param {Proc} proc */
  setProcess(kind, proc) {
    writeFileSync(join(this.dir, `proc-${kind}.json`), JSON.stringify(proc) + "\n");
  }

  /**
   * Reserve the next evidence file, `<evidence>/<NN>-<label><ext>`, by creating it empty and
   * exclusively: the number is the highest prefix so far plus one, past 99 too, and a drive that
   * races another for a number takes the next free one.
   * @param {string} label @param {string} ext
   */
  evidenceFile(label, ext) {
    mkdirSync(this.evidence, { recursive: true });
    const safe = label.replace(/[^A-Za-z0-9._-]+/g, "-");
    let n = readdirSync(this.evidence).map((f) => Number(/^(\d+)-/.exec(f)?.[1] ?? Number.NaN)).filter(Number.isFinite).reduce((a, b) => Math.max(a, b), 0) + 1;
    for (;;) {
      const file = join(this.evidence, `${String(n).padStart(2, "0")}-${safe}${ext}`);
      try {
        writeFileSync(file, "", { flag: "wx" });
        return file;
      } catch (error) {
        if (/** @type {NodeJS.ErrnoException} */ (error).code !== "EEXIST") throw error;
        n += 1;
      }
    }
  }

  /**
   * Run `askdb <args>` in the project and record it.
   * @param {string[]} args @param {{ label?: string }} [options] @returns {CliResult}
   */
  cli(args, { label } = {}) {
    const result = spawnSync(process.execPath, [CLI, ...args], { cwd: this.project, encoding: "utf8", env: { ...process.env, ASKDB_DEBUG: undefined }, timeout: 120_000 });
    const evidence = this.evidenceFile(label ?? `cli-${args[0] ?? "help"}`, ".json");
    const record = { command: ["askdb", ...args], cwd: this.project, exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
    writeFileSync(evidence, JSON.stringify(record, null, 2) + "\n");
    return { ...record, evidence };
  }

  /**
   * What the fake model answers from now on. Bare SQL is wrapped in a ```sql block, as an NL→SQL
   * reply has it; `raw` sends the text unchanged, for Studio's suggestions (candidates split on
   * `---` lines) and its tenant-policy draft (JSON).
   * @param {string} text @param {{ raw?: boolean }} [options]
   */
  modelReply(text, { raw = false } = {}) {
    writeFileSync(join(this.dir, "model-reply.txt"), raw || text.includes("```") ? text : `\`\`\`sql\n${text}\n\`\`\``);
  }

  /**
   * The requests the fake model received, saved as evidence when `label` is given.
   * @param {{ label?: string }} [options] @returns {Array<{ at: string, path: string, body: string }>}
   */
  modelRequests({ label } = {}) {
    if (this.state.live) throw new Error("a live run has no recorded model requests.");
    const file = join(this.dir, "model-requests.jsonl");
    const lines = existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean) : [];
    if (label) writeFileSync(this.evidenceFile(label, ".jsonl"), lines.join("\n") + (lines.length ? "\n" : ""));
    return lines.map((l) => JSON.parse(l));
  }

  /** @param {string} name @param {string[]} args @param {string} readyText @returns {Promise<Proc>} */
  async startProcess(name, args, readyText) {
    const log = join(this.dir, `${name}.log`);
    writeFileSync(log, "");
    const fd = openSync(log, "a");
    const child = spawn(process.execPath, args, { cwd: this.project, detached: true, stdio: ["ignore", fd, fd], env: { ...process.env, ASKDB_DEBUG: undefined } });
    child.unref();
    const pid = child.pid;
    if (pid === undefined) throw new Error(`${name} did not start`);
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const text = readFileSync(log, "utf8");
      if (text.includes(readyText)) return { pid, marker: args[0], log };
      if (commandOf(pid) === undefined) throw new Error(`${name} exited before it was ready; its output:\n${text}`);
      await sleep(150);
    }
    try { process.kill(pid, "SIGTERM"); } catch {}
    throw new Error(`${name} was not ready within 30s (waited for "${readyText}"); see ${log}`);
  }

  /**
   * Start the HTTP API or Studio on the run's port. Throws if it is already running.
   * @param {"api" | "studio"} kind
   * @param {string | null} [schema] schema folder, relative to the project. `null` passes none: Studio
   *   then opens its folder from the config (`./askdb`), or its setup wizard when that doesn't exist.
   */
  async start(kind, schema = "schemas/orders-users-sensitive.schema") {
    const running = this.processes()[kind];
    if (isOurs(running)) throw new Error(`${kind} already running (pid ${running.pid}); stop it first.`);
    const schemaArgs = schema === null ? [] : [kind === "api" ? "--schema-path" : "--schema", schema];
    // The run's port and host on the command line too: a project without a config (Studio's
    // setup wizard) would otherwise fall back to the default port and collide with other Studios.
    const listenArgs = ["--port", String(this.state.ports[kind]), "--host", "127.0.0.1"];
    const proc =
      kind === "api"
        ? await this.startProcess("api", [HTTP_API, ...schemaArgs, ...listenArgs], "AskDB HTTP API listening on")
        : await this.startProcess("studio", [CLI, "studio", ...schemaArgs, ...listenArgs], "AskDB Studio is running at");
    this.setProcess(kind, proc);
    return proc;
  }

  /** Stop one process this run started. Returns whether it was running. @param {string} kind */
  async stop(kind) {
    const proc = this.processes()[kind];
    let stopped = false;
    if (isOurs(proc)) {
      process.kill(proc.pid, "SIGTERM");
      for (let i = 0; i < 40 && isOurs(proc); i++) await sleep(100);
      if (isOurs(proc)) process.kill(proc.pid, "SIGKILL");
      stopped = true;
    }
    rmSync(join(this.dir, `proc-${kind}.json`), { force: true });
    return stopped;
  }

  /**
   * One HTTP request to the API or Studio, recorded as evidence. Studio requests carry its
   * session token, Origin and JSON content type, as the page's own requests do.
   * @param {"api" | "studio"} kind @param {string} method @param {string} path @param {unknown} [body]
   * @param {{ label?: string }} [options] @returns {Promise<HttpResult>}
   */
  async request(kind, method, path, body, { label } = {}) {
    const base = this.url(kind);
    /** @type {Record<string, string>} */
    const headers = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (kind === "studio") {
      const page = await fetch(`${base}/`).then((r) => r.text());
      const token = /name="askdb-studio-token" content="([^"]+)"/.exec(page)?.[1];
      if (!token) throw new Error("Studio's page has no askdb-studio-token meta tag: is Studio up?");
      headers["x-askdb-studio-token"] = token;
      headers.origin = base;
    }
    const started = Date.now();
    const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch {}
    const evidence = this.evidenceFile(label ?? `${kind}-${method}-${path}`, ".json");
    writeFileSync(evidence, JSON.stringify({ request: { method, url: `${base}${path}`, body }, status: res.status, ms: Date.now() - started, response: json ?? text }, null, 2) + "\n");
    return { status: res.status, json, text, evidence };
  }

  /** Read-only health checks. @returns {Promise<Array<{ ok: boolean, check: string, detail: string }>>} */
  async doctor() {
    /** @type {Array<{ ok: boolean, check: string, detail: string }>} */
    const checks = [];
    /** @param {boolean} ok @param {string} check @param {string} detail */
    const report = (ok, check, detail) => checks.push({ ok, check, detail });

    const version = spawnSync(process.execPath, [CLI, "--version"], { encoding: "utf8" });
    const want = JSON.parse(readFileSync(join(pkgDir("askdb"), "package.json"), "utf8")).version;
    report(version.status === 0 && version.stdout.includes(want), "cli build", `askdb --version → ${version.stdout.trim() || version.stderr.trim()} (package.json ${want})`);

    const newest = (/** @type {string} */ dir) => {
      let max = 0;
      const walk = (/** @type {string} */ d) => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
          if (e.name === "node_modules" || e.name.startsWith(".")) continue;
          const f = join(d, e.name);
          if (e.isDirectory()) walk(f);
          else max = Math.max(max, statSync(f).mtimeMs);
        }
      };
      if (existsSync(dir)) walk(dir);
      return max;
    };
    const stale = workspaceClosure().filter((pkg) => existsSync(join(pkg, "dist")) && newest(join(pkg, "src")) > newest(join(pkg, "dist"))).map((pkg) => relative(repo, pkg));
    report(stale.length === 0, "dist current", stale.length ? `source newer than dist in ${stale.join(", ")}: rebuild` : "every dist is newer than its source");

    report(existsSync(join(this.project, "askdb.config.ts")), "project", this.project);
    const procs = this.processes();
    if (!this.state.live) {
      const health = await fetch(`${this.url("model")}/__verify/health`).then((r) => r.json()).catch((e) => ({ error: String(e) }));
      report(isOurs(procs.model) && health.ok === true && health.runDir === this.dir, "fake model", `pid ${procs.model?.pid} on :${this.state.ports.model}`);
    } else {
      report(Boolean(process.env.OPENAI_API_KEY) || existsSync(join(this.project, ".env")), "live model key", "OPENAI_API_KEY in env or .env copied");
    }
    if (procs.api) {
      const health = await fetch(`${this.url("api")}/health`).then((r) => r.json()).catch((e) => ({ error: String(e) }));
      report(isOurs(procs.api) && health.ok === true, "http api", `pid ${procs.api.pid} on :${this.state.ports.api} → ${JSON.stringify(health)}`);
    }
    if (procs.studio) {
      const page = await fetch(`${this.url("studio")}/`).then((r) => r.text()).catch(() => "");
      report(isOurs(procs.studio) && page.includes('name="askdb-studio-token"'), "studio", `pid ${procs.studio.pid} on :${this.state.ports.studio}`);
    }
    return checks;
  }

  /** Stop what this run started and delete its project. The evidence folder stays. */
  async cleanup() {
    const stopped = [];
    for (const kind of Object.keys(this.processes())) if (await this.stop(kind)) stopped.push(kind);
    // Logs and the model's requests are evidence too: copy them in before the scratch goes.
    for (const f of readdirSync(this.dir)) {
      if (f.endsWith(".log") || f === "model-requests.jsonl") cpSync(join(this.dir, f), join(this.evidence, `zz-${f}`));
    }
    rmSync(this.project, { recursive: true, force: true });
    for (const f of readdirSync(this.dir)) if (f !== "evidence") rmSync(join(this.dir, f), { recursive: true, force: true });
    appendFileSync(join(this.evidence, "zz-cleanup.txt"), `cleaned ${new Date().toISOString()}\n`);
    const current = currentRunFile();
    if (existsSync(current) && readFileSync(current, "utf8").trim() === this.id) rmSync(current);
    return stopped;
  }
}
