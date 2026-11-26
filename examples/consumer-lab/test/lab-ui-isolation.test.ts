/**
 * `pnpm lab ui` with two engines failing: one input run on every engine at once, driven over
 * HTTP the way its page drives it (`POST /api/run`, read back as NDJSON), while Postgres never
 * answers and MySQL is down; then the server stopped while Postgres's connection still hangs.
 * Both scenarios read the one run `runWithEnginesDown()` starts, so they stay in one file, and
 * the shutdown scenario runs last.
 *
 * `lab ui`'s scenarios are split over the `lab-ui-*.test.ts` files, so vitest runs them on
 * different workers; what they share is in `support/lab-ui.ts`. No production seam: the tests
 * start the real `pnpm lab ui` command (through tsx's loader, as `pnpm lab` does) and send the
 * requests the page sends. The `lab ui` here starts without a key (`support/lab-ui.ts`), so it
 * can't ask the live model. Engines are made to fail only from outside:
 * `ASKDB_FIXTURE_<ENGINE>_PORT`, the fixture's own documented port override, points one engine
 * at a closed port or at a socket that never answers. `--timeout` is the command's own option.
 *
 * The isolation scenario has a cell per engine; the shutdown scenario doesn't depend on an
 * engine and runs once, as `[postgres]`.
 *
 * Needs the `cli-introspect-engine` capability (every column builds a schema artifact), the
 * fixture (`pnpm fixture:up`) and an installed lab (`pnpm lab:use .`).
 */
import { createServer, type Server, type Socket } from "node:net";
import { afterAll, expect, it } from "vitest";
import { ensureArtifact } from "../src/artifacts.js";
import { needsCapability } from "../src/capabilities.js";
import { SUPPORTED_DIALECTS, type SupportedDialect } from "../src/dialects.js";
import { freePort } from "../src/server-process.js";
import { AGENCY_NAMES, column, startLabUiProcess, uiRun, type LabUiProcess, type UiRun } from "./support/lab-ui.js";

/**
 * Postgres points at a socket that accepts and never answers; MySQL at a port nothing listens on.
 * `lab ui` starts each engine's timer at the fork, so this must exceed five concurrent worker boots
 * under CI load, or the healthy engines report `timeout` too (#528).
 */
const TIMEOUT_MS = 30_000;
let failingUi: LabUiProcess | undefined;
let silentServer: Server | undefined;
const heldSockets: Socket[] = [];
let failingRun: Promise<UiRun> | undefined;

/**
 * The input run with two engines failing. The schema artifacts are built first, from the
 * real ports, so the failures come from executing the SQL, not from introspection.
 */
function runWithEnginesDown(): Promise<UiRun> {
  failingRun ??= (async () => {
    for (const dialect of SUPPORTED_DIALECTS) ensureArtifact(dialect);
    silentServer = createServer((socket) => void heldSockets.push(socket));
    await new Promise<void>((resolve) => silentServer!.listen(0, "127.0.0.1", resolve));
    failingUi = await startLabUiProcess({
      args: ["--timeout", String(TIMEOUT_MS)],
      env: {
        ASKDB_FIXTURE_POSTGRES_PORT: String((silentServer.address() as { port: number }).port),
        ASKDB_FIXTURE_MYSQL_PORT: String(await freePort()),
      },
    });
    return uiRun(failingUi, { question: AGENCY_NAMES });
  })();
  return failingRun;
}

afterAll(async () => {
  await failingUi?.close();
  heldSockets.forEach((s) => s.destroy());
  await new Promise((resolve) => (silentServer ? silentServer.close(resolve) : resolve(undefined)));
});

/*
 * Protects: engines run concurrently and fail alone (issue #262): an engine that is down
 * fails in its own column; one that never answers is reported as timed out after
 * `--timeout`, its column sent after the others; the remaining engines still complete,
 * agree and match the oracle.
 * Catches: one engine's error failing the whole run, engines run one after another so a
 * slow one holds the rest back, a hung engine that keeps the run from ever finishing, and a
 * failed engine counted in the agreement.
 * Not covered elsewhere: no other test runs more than one engine at a time.
 */
it("[postgres] lab-ui-isolation: an engine that never answers times out in its own column, after the others", async (ctx) => {
  needsCapability(ctx, "cli-introspect-engine");
  const run = await runWithEnginesDown();
  const pg = column(run, "postgres");

  expect(pg.status).toBe("timeout");
  expect(pg.error).toBe(`no result after ${TIMEOUT_MS} ms`);
  expect(run.engines.at(-1)?.dialect).toBe("postgres");
});

it("[mysql] lab-ui-isolation: an engine that's down fails in its own column", async (ctx) => {
  needsCapability(ctx, "cli-introspect-engine");
  const mysql = column(await runWithEnginesDown(), "mysql");

  expect(mysql.status).toBe("failed");
  expect(mysql.error).toMatch(/ECONNREFUSED/);
});

it.for([["mariadb"], ["sqlserver"], ["sqlite"]] as [SupportedDialect][])(
  "[%s] lab-ui-isolation: completes, agrees and matches the oracle while other engines fail",
  async ([dialect], ctx) => {
    needsCapability(ctx, "cli-introspect-engine");
    const run = await runWithEnginesDown();
    const event = column(run, dialect);

    expect(event.status).toBe("ok");
    expect(event.rowCount).toBe(7);
    expect(event.timings.totalMs).toBeLessThan(TIMEOUT_MS);
    expect(run.summary?.agreement.verdict).toBe("agree");
    expect(run.summary?.agreement.groups[0]).toContain(dialect);
    expect(run.summary?.agreement.notCompared.map((n) => n.dialect).slice().sort()).toEqual(["mysql", "postgres"]);
    expect(run.summary?.oracle?.[dialect]).toEqual({ verdict: "match" });
  },
);

/*
 * Protects: `lab ui` stops on SIGTERM (or Ctrl-C) even while an engine's connection still
 * hangs, as the isolation run above leaves Postgres's.
 * Catches: a shutdown that closes only the HTTP server, so the timed-out engine's socket
 * keeps the process alive until someone kills it.
 * Not covered elsewhere: every other test stops the server with nothing left running.
 * Runs after the isolation scenarios, which start the run it stops.
 */
it("[postgres] lab-ui-shutdown: exits on SIGTERM while a timed-out engine's connection still hangs", async (ctx) => {
  needsCapability(ctx, "cli-introspect-engine");
  await runWithEnginesDown();

  expect(await failingUi!.stop(), "lab ui ignored SIGTERM and had to be killed").toEqual({ forced: false });
});
