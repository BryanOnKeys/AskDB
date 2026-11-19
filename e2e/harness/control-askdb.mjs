#!/usr/bin/env node
// @ts-check
// The agent's handle on a verification run (`vctl` in .agents/skills/verify-askdb/SKILL.md).
// It drives the same AskdbRun the replay tests use. `node e2e/harness/control-askdb.mjs help`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { AskdbRun, currentRunFile } from "./askdb-run.mjs";

const argv = process.argv.slice(2);
const dashDash = argv.indexOf("--");
const own = dashDash === -1 ? argv : argv.slice(0, dashDash);
const passThrough = dashDash === -1 ? [] : argv.slice(dashDash + 1);
/** @param {string} name */
function flag(name) {
  const i = own.indexOf(name);
  if (i === -1) return undefined;
  const value = own[i + 1];
  own.splice(i, 2);
  return value;
}
const runFlag = flag("--run");
const label = flag("--label");
const liveAt = own.indexOf("--live");
const live = liveAt !== -1;
if (live) own.splice(liveAt, 1);
const [command, ...rest] = own;

/** @param {string} message @returns {never} */
function die(message) {
  console.error(`control-askdb: ${message}`);
  process.exit(1);
}

function runId() {
  const current = currentRunFile();
  const id = runFlag ?? process.env.ASKDB_VERIFY_RUN ?? (existsSync(current) ? readFileSync(current, "utf8").trim() : undefined);
  if (!id) die("no run: run `setup` first, or pass --run <id>.");
  return /** @type {string} */ (id);
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

try {
  switch (command) {
    case "setup": {
      const run = await AskdbRun.create({ id: runFlag ?? process.env.ASKDB_VERIFY_RUN, live });
      mkdirSync(dirname(currentRunFile()), { recursive: true });
      writeFileSync(currentRunFile(), run.id + "\n");
      console.log(`run ${run.id} ready (${live ? "live model from OPENAI_API_KEY" : `fake model on :${run.state.ports.model}`})`);
      console.log(`  project:  ${run.project}`);
      console.log(`  evidence: ${run.evidence}`);
      console.log(`  later commands from this checkout use this run; pass --run ${run.id} to name it`);
      break;
    }
    case "doctor": {
      const run = AskdbRun.load(runId());
      console.log(`run ${run.id}`);
      const checks = await run.doctor();
      for (const c of checks) console.log(`${c.ok ? "ok  " : "FAIL"} ${c.check}${c.detail ? `: ${c.detail}` : ""}`);
      process.exit(checks.every((c) => c.ok) ? 0 : 1);
    }
    case "cli": {
      const result = AskdbRun.load(runId()).cli(passThrough, { label });
      process.stdout.write(result.stdout);
      process.stderr.write(result.stderr);
      console.error(`[control-askdb] exit ${result.exitCode} · evidence ${result.evidence}`);
      process.exit(result.exitCode ?? 1);
    }
    case "model": {
      const run = AskdbRun.load(runId());
      const [sub, ...words] = rest;
      if (sub === "reply") {
        if (words.length === 0) die("model reply needs the reply text (bare SQL is wrapped in a ```sql block).");
        run.modelReply(words.join(" "));
        console.log(`fake model now replies: ${words.join(" ")}`);
      } else if (sub === "requests") {
        console.log(`${run.modelRequests({ label: label ?? "model-requests" }).length} model request(s) saved to ${run.evidence}`);
      } else die("model takes `reply <text>` or `requests`.");
      break;
    }
    case "api":
    case "studio": {
      const run = AskdbRun.load(runId());
      const [sub, schema] = rest;
      if (sub === "start") {
        const proc = await run.start(command, schema);
        console.log(`${command} running: pid ${proc.pid}, ${run.url(command)} (log ${proc.log})`);
      } else if (sub === "stop") {
        console.log((await run.stop(command)) ? `${command} stopped` : `${command} was not running`);
      } else die(`${command} takes \`start [schema-dir]\` or \`stop\`.`);
      break;
    }
    case "api-request":
    case "studio-request": {
      const run = AskdbRun.load(runId());
      const [method, path, body] = rest;
      if (!method || !path) die(`${command} takes <METHOD> <path> [json-body].`);
      const res = await run.request(command === "api-request" ? "api" : "studio", method, path, body === undefined ? undefined : JSON.parse(body), { label });
      console.log(`${res.status} ${res.json ? JSON.stringify(res.json, null, 2) : res.text}`);
      console.error(`[control-askdb] evidence ${res.evidence}`);
      process.exit(res.status < 400 ? 0 : 1);
    }
    case "cleanup": {
      const run = AskdbRun.load(runId());
      const stopped = await run.cleanup();
      console.log(`stopped: ${stopped.join(", ") || "nothing running"}`);
      console.log(`run ${run.id} cleaned; evidence kept at ${run.evidence}`);
      break;
    }
    case "help":
    case undefined:
      console.log(HELP);
      break;
    default:
      die(`unknown command "${command}".\n${HELP}`);
  }
} catch (error) {
  die(error instanceof Error ? error.message : String(error));
}
