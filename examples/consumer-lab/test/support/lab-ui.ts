/**
 * `pnpm lab ui` as a child process, and `POST /api/run` read back as its NDJSON events.
 * Requests go through `node:http` (`studioRequest`), so a test can send any `Host`,
 * `Origin` or `Content-Type`. Also what the `lab-ui-*.test.ts` files share: the catalog
 * questions they ask, `pnpm lab ask` run beside the page, and a column read as `lab ask`'s output.
 */
import { SUPPORTED_DIALECTS, type SupportedDialect } from "../../src/dialects.js";
import { findQuestion } from "../../src/model/catalog.js";
import type { EngineEvent, UiInput } from "../../src/ui/server.js";
import type { Summary } from "../../src/ui/summary.js";
import { LAB_ROOT } from "../../src/paths.js";
import { startServerProcess, type ServerProcess, type ServerStop } from "../../src/server-process.js";
import { studioRequest, type StudioAddress } from "../../src/studio.js";
import { labCliCommand, runLab, type CliRun } from "./lab-cli.js";

export interface LabUiProcess extends StudioAddress {
  close(): Promise<void>;
  /** `close()`, saying whether the process ignored SIGTERM and needed SIGKILL. */
  stop(): Promise<ServerStop>;
}

/**
 * Start `pnpm lab ui --port <free port>` with `args` and `env` added; ready once `GET /` answers 200.
 * It has no key, from the shell or `.env.live` (an empty variable wins over the file), and doesn't
 * see CI, so the live model is unavailable for want of a key: no test can make a paid call.
 */
export async function startLabUiProcess({ args = [], env = {} }: { args?: string[]; env?: Record<string, string> } = {}): Promise<LabUiProcess> {
  const address = (port: number): StudioAddress => ({ port, host: `127.0.0.1:${port}`, origin: `http://127.0.0.1:${port}` });
  const server: ServerProcess = await startServerProcess({
    name: "lab ui",
    bin: labCliCommand([]).bin,
    args: (port) => labCliCommand(["ui", "--port", String(port), ...args]).args,
    cwd: LAB_ROOT,
    env: { CI: "", GITHUB_ACTIONS: "", OPENAI_API_KEY: "", ...env },
    ready: async (port) => (await studioRequest(address(port))).status === 200,
    readyWhen: "GET /",
  });
  return { ...address(server.port), close: () => server.close(), stop: () => server.stop() };
}

export interface UiRun {
  status: number;
  /** Engine events, in the order the server sent them. */
  engines: EngineEvent[];
  summary?: Summary;
}

/** `POST /api/run` as the page sends it. */
export async function uiRun(ui: StudioAddress, input: UiInput): Promise<UiRun> {
  const reply = await studioRequest(ui, {
    method: "POST",
    path: "/api/run",
    headers: { "content-type": "application/json", origin: ui.origin },
    body: JSON.stringify(input),
  });
  if (reply.status !== 200) return { status: reply.status, engines: [] };
  const events = reply.text.split("\n").filter(Boolean).map((line) => JSON.parse(line));
  return {
    status: reply.status,
    engines: events.filter((e) => e.type === "engine"),
    summary: events.find((e) => e.type === "summary")?.summary,
  };
}

/** One engine's event; fails when the run has none for it. */
export function column(run: UiRun, dialect: string): EngineEvent {
  const event = run.engines.find((e) => e.dialect === dialect);
  if (!event) throw new Error(`no column for ${dialect} in ${JSON.stringify(run).slice(0, 500)}`);
  return event;
}

export const AGENCY_NAMES = findQuestion("agency-names")!.text;
/** Ordered decimals: the drivers return them as different JavaScript types, which normalization reconciles. */
export const TOP_PAID = findQuestion("top-paid-agencies")!.text;
export const NO_REPLY = "Which agency has the most volunteers?";
/** The parameterized question, which the grader checks for more than its rows. */
export const PROGRAMS_SINCE = findQuestion("programs-started-since")!.text;
export const UNPAID = findQuestion("unpaid-orders")!.text;
export const SATO = findQuestion("client-named-sato")!.text;
export const DIALECTS = SUPPORTED_DIALECTS.map((d) => [d] as [SupportedDialect]);

/** A `pnpm lab` run, with what it printed to each stream. */
export type LabRun = Pick<CliRun, "status" | "stdout" | "stderr">;

/** `pnpm lab <args>`. One still running after `killAfterMs` is killed, with its children, and has status null. */
export async function lab(args: string[], killAfterMs = 120_000): Promise<LabRun> {
  const { status, stdout, stderr } = await runLab(args, { killAfterMs });
  return { status, stdout, stderr };
}

export const labAsk = (...args: string[]) => lab(["ask", ...args]);

/** Each run starts its own replay server on a free port: mask the port, so nothing else may differ. */
export const maskPorts = (run: LabRun): LabRun => {
  const strip = (text: string) => text.replace(/127\.0\.0\.1:\d+/g, "127.0.0.1:<port>");
  return { status: run.status, stdout: strip(run.stdout), stderr: strip(run.stderr) };
};

/** What a column says `lab ask` prints, as `lab ask` would print it to each stream. */
export function printed(run: UiRun, dialect: SupportedDialect): LabRun {
  const event = column(run, dialect);
  const stream = (s: "stdout" | "stderr") => event.lines.filter((l) => l.stream === s).map((l) => `${l.text}\n`).join("");
  return maskPorts({ status: event.exitCode ?? null, stdout: stream("stdout"), stderr: stream("stderr") });
}
