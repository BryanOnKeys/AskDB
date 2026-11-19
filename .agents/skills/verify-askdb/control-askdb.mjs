#!/usr/bin/env node
// verify-askdb harness: a disposable AskDB project per run, driven through the built CLI, HTTP API
// and Studio, with every drive's evidence kept outside the project. Usage: see SKILL.md, or run
// `node .agents/skills/verify-askdb/control-askdb.mjs help`.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, cpSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const here = dirname(fileURLToPath(import.meta.url));
const repo = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: here, encoding: "utf8" }).trim();
const CLI = join(repo, "apps/cli/dist/cli.js");
const HTTP_API = join(repo, "apps/http-api/dist/bin.js");
const verifyRoot = process.env.ASKDB_VERIFY_ROOT ?? join(tmpdir(), "askdb-verify");

// ---------------------------------------------------------------------------
// Arguments and run state
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const dashDash = argv.indexOf("--");
const own = dashDash === -1 ? argv : argv.slice(0, dashDash);
const passThrough = dashDash === -1 ? [] : argv.slice(dashDash + 1);
function flag(name) {
  const i = own.indexOf(name);
  if (i === -1) return undefined;
  const value = own[i + 1];
  own.splice(i, 2);
  return value;
}
function bool(name) {
  const i = own.indexOf(name);
  if (i === -1) return false;
  own.splice(i, 1);
  return true;
}

const runFlag = flag("--run");
const label = flag("--label");
const live = bool("--live");
const [command, ...rest] = own;

function die(message) {
  console.error(`control-askdb: ${message}`);
  process.exit(1);
}

/** The run `setup` last made from this checkout, so commands in separate shells find it. */
const currentFile = join(verifyRoot, `current-${createHash("sha256").update(repo).digest("hex").slice(0, 12)}`);
function runId() {
  const id = runFlag ?? process.env.ASKDB_VERIFY_RUN ?? (existsSync(currentFile) ? readFileSync(currentFile, "utf8").trim() : undefined);
  if (!id) die("no run: run `setup` first, or pass --run <id>.");
  return id;
}
const paths = (id) => ({
  run: join(verifyRoot, id),
  project: join(verifyRoot, id, "project"),
  evidence: join(verifyRoot, id, "evidence"),
  state: join(verifyRoot, id, "state.json"),
});
function loadState(id) {
  const p = paths(id);
  if (!existsSync(p.state)) die(`run ${id} has no state at ${p.state}: run \`setup\` first.`);
  return JSON.parse(readFileSync(p.state, "utf8"));
}
function saveState(id, state) {
  writeFileSync(paths(id).state, JSON.stringify(state, null, 2) + "\n");
}

/** Next evidence file stem: <evidence>/<NN>-<label>. */
function evidenceStem(id, fallback) {
  const dir = paths(id).evidence;
  mkdirSync(dir, { recursive: true });
  const n = readdirSync(dir).map((f) => Number(f.slice(0, 2))).filter(Number.isFinite).reduce((a, b) => Math.max(a, b), 0) + 1;
  const name = (label ?? fallback).replace(/[^A-Za-z0-9._-]+/g, "-");
  return join(dir, `${String(n).padStart(2, "0")}-${name}`);
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// ---------------------------------------------------------------------------
// Processes this harness starts (and only those)
// ---------------------------------------------------------------------------

/** Command line of `pid`, or undefined when it isn't running. */
function commandOf(pid) {
  const ps = spawnSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" });
  return ps.status === 0 ? ps.stdout.trim() : undefined;
}
/** Whether `pid` is still the process we started: alive, and its command line still names `marker`. */
function ours(proc) {
  if (!proc?.pid) return false;
  const cmd = commandOf(proc.pid);
  return cmd !== undefined && cmd.includes(proc.marker);
}

async function startDetached(id, name, args, readyText) {
  const p = paths(id);
  const log = join(p.run, `${name}.log`);
  writeFileSync(log, "");
  const fd = openSync(log, "a");
  const child = spawn(process.execPath, args, { cwd: p.project, detached: true, stdio: ["ignore", fd, fd], env: { ...process.env, ASKDB_DEBUG: undefined } });
  child.unref();
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const text = readFileSync(log, "utf8");
    if (text.includes(readyText)) return { pid: child.pid, marker: args[0], log };
    if (commandOf(child.pid) === undefined) die(`${name} exited before it was ready; its output:\n${text}`);
    await new Promise((r) => setTimeout(r, 150));
  }
  try { process.kill(child.pid, "SIGTERM"); } catch {}
  die(`${name} was not ready within 30s (waited for "${readyText}"); see ${log}`);
}

async function stop(proc) {
  if (!ours(proc)) return false;
  process.kill(proc.pid, "SIGTERM");
  for (let i = 0; i < 40 && ours(proc); i++) await new Promise((r) => setTimeout(r, 100));
  if (ours(proc)) process.kill(proc.pid, "SIGKILL");
  return true;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function setup() {
  for (const built of [CLI, HTTP_API, join(repo, "apps/studio/dist/client/index.html")]) {
    if (!existsSync(built)) die(`${built} is missing. Build first: pnpm exec turbo run build --filter=askdb --filter=@askdb/http-api --filter=@askdb/studio`);
  }
  const id = runFlag ?? process.env.ASKDB_VERIFY_RUN ?? `v${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}-${randomBytes(2).toString("hex")}`;
  const p = paths(id);
  if (existsSync(p.project)) die(`run ${id} already has a project at ${p.project}: pick a new run id, or \`cleanup\` it first.`);
  mkdirSync(p.project, { recursive: true });
  mkdirSync(p.evidence, { recursive: true });

  // Verification scaffolding: what an installed project would resolve from its own node_modules.
  mkdirSync(join(p.project, "node_modules/@askdb"), { recursive: true });
  symlinkSync(join(repo, "packages/config"), join(p.project, "node_modules/@askdb/config"));
  symlinkSync(join(repo, "packages/sqlite/node_modules/better-sqlite3"), join(p.project, "node_modules/better-sqlite3"));

  // The Quickstart's shop database, and copies of the schema fixtures (Studio writes into its schema folder).
  new DatabaseSync(join(p.project, "shop.db")).exec(readFileSync(join(repo, "examples/quickstart-shop/shop.sql"), "utf8"));
  for (const fixture of ["orders-users-sensitive.schema", "agency-multi-tenant.schema"]) {
    cpSync(join(repo, "fixtures/schemas", fixture), join(p.project, "schemas", fixture), { recursive: true });
  }

  const ports = { model: await freePort(), api: await freePort(), studio: await freePort() };
  const ai = live
    ? `{ provider: "openai", providerConfig: { openai: { apiKey: env("OPENAI_API_KEY") } }, language: { model: env("OPENAI_MODEL") } }`
    : `{ provider: "openai", providerConfig: { openai: { apiKey: "sk-verify", baseUrl: "http://127.0.0.1:${ports.model}/v1" } }, language: { model: "gpt-4o-mini" } }`;
  writeFileSync(
    join(p.project, "askdb.config.ts"),
    `import { defineConfig, env } from "@askdb/config";
// Written by verify-askdb (control-askdb.mjs setup) for run ${id}.
export default defineConfig({
  ai: ${ai},
  introspection: { provider: "sqlite", providerConfig: { sqlite: { file: "./shop.db" } }, outputDir: "./askdb" },
  rag: { embedder: "mock", store: "file", storeConfig: { file: {} } },
  studio: { listen: { host: "127.0.0.1", port: ${ports.studio} }, execute: { enabled: true, provider: "sqlite", file: "./shop.db" } },
  httpApi: { listen: { host: "127.0.0.1", port: ${ports.api} } },
});
`,
  );
  if (live) {
    for (const name of [".env"]) if (existsSync(join(repo, name))) cpSync(join(repo, name), join(p.project, name));
  }

  const state = { id, repo, live, ports, project: p.project, evidence: p.evidence, processes: {} };
  saveState(id, state);
  if (!live) {
    state.processes.model = await startDetached(id, "model", [join(here, "fake-openai.mjs"), p.run, String(ports.model)], "fake-openai listening");
    saveState(id, state);
  }
  writeFileSync(currentFile, id + "\n");
  console.log(`run ${id} ready (${live ? "live model from OPENAI_API_KEY" : `fake model on :${ports.model}`})`);
  console.log(`  project:  ${p.project}`);
  console.log(`  evidence: ${p.evidence}`);
  console.log(`  later commands from this checkout use this run; pass --run ${id} to name it`);
}

async function doctor() {
  const id = runId();
  const state = loadState(id);
  console.log(`run ${id}`);
  let failed = false;
  const report = (ok, check, detail) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${check}${detail ? `: ${detail}` : ""}`);
    if (!ok) failed = true;
  };

  const version = spawnSync(process.execPath, [CLI, "--version"], { encoding: "utf8" });
  const want = JSON.parse(readFileSync(join(repo, "apps/cli/package.json"), "utf8")).version;
  report(version.status === 0 && version.stdout.includes(want), "cli build", `askdb --version → ${version.stdout.trim() || version.stderr.trim()} (package.json ${want})`);

  const newest = (dir) => {
    let max = 0;
    const walk = (d) => {
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
  const stale = ["packages/core", "packages/config", "packages/ai", "packages/client", "packages/introspect", "packages/sqlite", "apps/cli", "apps/http-api", "apps/studio"].filter(
    (pkg) => newest(join(repo, pkg, "src")) > newest(join(repo, pkg, "dist")),
  );
  report(stale.length === 0, "dist current", stale.length ? `source newer than dist in ${stale.join(", ")}: rebuild` : "every dist is newer than its source");

  report(existsSync(join(state.project, "askdb.config.ts")), "project", state.project);
  if (!state.live) {
    const health = await fetch(`http://127.0.0.1:${state.ports.model}/__verify/health`).then((r) => r.json()).catch((e) => ({ error: String(e) }));
    report(ours(state.processes.model) && health.ok === true && health.runDir === paths(id).run, "fake model", `pid ${state.processes.model?.pid} on :${state.ports.model}`);
  } else {
    report(Boolean(process.env.OPENAI_API_KEY) || existsSync(join(state.project, ".env")), "live model key", "OPENAI_API_KEY in env or .env copied");
  }
  if (state.processes.api) {
    const health = await fetch(`http://127.0.0.1:${state.ports.api}/health`).then((r) => r.json()).catch((e) => ({ error: String(e) }));
    report(ours(state.processes.api) && health.ok === true, "http api", `pid ${state.processes.api.pid} on :${state.ports.api} → ${JSON.stringify(health)}`);
  }
  if (state.processes.studio) {
    const page = await fetch(`http://127.0.0.1:${state.ports.studio}/`).then((r) => r.text()).catch(() => "");
    report(ours(state.processes.studio) && page.includes('name="askdb-studio-token"'), "studio", `pid ${state.processes.studio.pid} on :${state.ports.studio}`);
  }
  process.exit(failed ? 1 : 0);
}

function cli() {
  const id = runId();
  const state = loadState(id);
  const result = spawnSync(process.execPath, [CLI, ...passThrough], { cwd: state.project, encoding: "utf8", env: { ...process.env, ASKDB_DEBUG: undefined }, timeout: 120_000 });
  const stem = evidenceStem(id, `cli-${passThrough[0] ?? "help"}`);
  const record = { command: ["askdb", ...passThrough], cwd: state.project, exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
  writeFileSync(`${stem}.json`, JSON.stringify(record, null, 2) + "\n");
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  console.error(`[control-askdb] exit ${result.status} · evidence ${stem}.json`);
  process.exit(result.status ?? 1);
}

function model() {
  const id = runId();
  const state = loadState(id);
  const [sub, ...words] = rest;
  const p = paths(id);
  if (sub === "reply") {
    const text = words.join(" ");
    if (!text) die("model reply needs the reply text (bare SQL is wrapped in a ```sql block).");
    writeFileSync(join(p.run, "model-reply.txt"), text.includes("```") ? text : `\`\`\`sql\n${text}\n\`\`\``);
    console.log(`fake model now replies: ${readFileSync(join(p.run, "model-reply.txt"), "utf8").replace(/\n/g, "\\n")}`);
  } else if (sub === "requests") {
    if (state.live) die("a live run has no recorded model requests.");
    const file = join(p.run, "model-requests.jsonl");
    const lines = existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean) : [];
    const stem = evidenceStem(id, "model-requests");
    writeFileSync(`${stem}.jsonl`, lines.join("\n") + (lines.length ? "\n" : ""));
    console.log(`${lines.length} model request(s) · evidence ${stem}.jsonl`);
  } else die("model takes `reply <text>` or `requests`.");
}

async function server(kind) {
  const id = runId();
  const state = loadState(id);
  const [sub, schema = "schemas/orders-users-sensitive.schema"] = rest;
  if (sub === "start") {
    if (ours(state.processes[kind])) die(`${kind} already running (pid ${state.processes[kind].pid}); stop it first.`);
    const proc =
      kind === "api"
        ? await startDetached(id, "api", [HTTP_API, "--schema-path", schema], "AskDB HTTP API listening on")
        : await startDetached(id, "studio", [CLI, "studio", "--schema", schema], "AskDB Studio is running at");
    state.processes[kind] = proc;
    saveState(id, state);
    console.log(`${kind} running: pid ${proc.pid}, http://127.0.0.1:${state.ports[kind]} (log ${proc.log})`);
  } else if (sub === "stop") {
    const stopped = await stop(state.processes[kind]);
    delete state.processes[kind];
    saveState(id, state);
    console.log(stopped ? `${kind} stopped` : `${kind} was not running`);
  } else die(`${kind} takes \`start [schema-dir]\` or \`stop\`.`);
}

/** One HTTP request to the API or Studio, recorded as evidence. Studio requests carry its token, Origin and JSON type. */
async function request(kind) {
  const id = runId();
  const state = loadState(id);
  const [method, path, body] = rest;
  if (!method || !path) die(`${kind}-request takes <METHOD> <path> [json-body].`);
  const base = `http://127.0.0.1:${state.ports[kind]}`;
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (kind === "studio") {
    const page = await fetch(`${base}/`).then((r) => r.text());
    const token = /name="askdb-studio-token" content="([^"]+)"/.exec(page)?.[1];
    if (!token) die("Studio's page has no askdb-studio-token meta tag: is Studio up? Run doctor.");
    headers["x-askdb-studio-token"] = token;
    headers.origin = base;
  }
  const started = Date.now();
  const res = await fetch(`${base}${path}`, { method, headers, body });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch {}
  const stem = evidenceStem(id, `${kind}-${method}-${path}`);
  writeFileSync(`${stem}.json`, JSON.stringify({ request: { method, url: `${base}${path}`, body: body === undefined ? undefined : JSON.parse(body) }, status: res.status, ms: Date.now() - started, response: json ?? text }, null, 2) + "\n");
  console.log(`${res.status} ${json ? JSON.stringify(json, null, 2) : text}`);
  console.error(`[control-askdb] evidence ${stem}.json`);
  process.exit(res.ok ? 0 : 1);
}

async function cleanup() {
  const id = runId();
  const p = paths(id);
  if (!existsSync(p.state)) die(`run ${id} has no state at ${p.state}; nothing to clean.`);
  const state = loadState(id);
  for (const [name, proc] of Object.entries(state.processes)) {
    console.log(`${name}: ${(await stop(proc)) ? `stopped pid ${proc.pid}` : "not running"}`);
  }
  // Logs and the model's requests are evidence too: move them in before the run's scratch goes.
  for (const f of readdirSync(p.run)) {
    if (f.endsWith(".log") || f === "model-requests.jsonl") cpSync(join(p.run, f), join(p.evidence, `zz-${f}`));
  }
  rmSync(p.project, { recursive: true, force: true });
  for (const f of readdirSync(p.run)) if (f !== "evidence") rmSync(join(p.run, f), { recursive: true, force: true });
  appendFileSync(join(p.evidence, "zz-cleanup.txt"), `cleaned ${new Date().toISOString()}\n`);
  if (existsSync(currentFile) && readFileSync(currentFile, "utf8").trim() === id) rmSync(currentFile);
  console.log(`run ${id} cleaned; evidence kept at ${p.evidence}`);
}

const HELP = `control-askdb <command> [--run <id>] [--label <name>]   (default run: the last \`setup\` from this checkout)
  setup [--live]                 new run: scratch project, shop.db, schema copies, fake model (or live key)
  doctor                         is this run worth driving? exit 1 on any FAIL
  cli [--label L] -- <args>      run \`askdb <args>\` in the project; evidence NN-L.json
  model reply <text|sql>         what the fake model answers from now on
  model requests [--label L]     save the prompts the fake model received as evidence
  api start [schema] | api stop          HTTP API on the run's port (default schema: schemas/orders-users-sensitive.schema)
  studio start [schema] | studio stop    Studio on the run's port
  api-request <METHOD> <path> [json]     request to the HTTP API; evidence
  studio-request <METHOD> <path> [json]  request to Studio's API with its token and Origin; evidence
  cleanup                        stop what this run started, delete its project; evidence stays`;

switch (command) {
  case "setup": await setup(); break;
  case "doctor": await doctor(); break;
  case "cli": cli(); break;
  case "model": model(); break;
  case "api": await server("api"); break;
  case "studio": await server("studio"); break;
  case "api-request": await request("api"); break;
  case "studio-request": await request("studio"); break;
  case "cleanup": await cleanup(); break;
  case "help": case undefined: console.log(HELP); break;
  default: die(`unknown command "${command}".\n${HELP}`);
}
