/**
 * `pnpm lab ui`'s page and its local-server rules: what the page names, and the requests the
 * server refuses, sent over HTTP as the page sends them.
 *
 * `lab ui`'s scenarios are split over the `lab-ui-*.test.ts` files, so vitest runs them on
 * different workers; what they share is in `support/lab-ui.ts`. No production seam: the tests
 * start the real `pnpm lab ui` command (through tsx's loader, as `pnpm lab` does) and send the
 * requests the page sends, or that request with one header changed. The `lab ui` here starts
 * without a key (`support/lab-ui.ts`), so it can't ask the live model.
 *
 * The scenarios don't depend on an engine and run once, as `[postgres]`, as the Studio suite's
 * protection scenarios do.
 *
 * Needs an installed lab (`pnpm lab:use .`).
 */
import { connect } from "node:net";
import { networkInterfaces } from "node:os";
import { afterAll, beforeAll, expect, it } from "vitest";
import { requireInstallTarget } from "../src/artifacts.js";
import { studioRequest } from "../src/studio.js";
import { AGENCY_NAMES, startLabUiProcess, type LabUiProcess } from "./support/lab-ui.js";

let ui: LabUiProcess;

beforeAll(async () => {
  ui = await startLabUiProcess();
});

afterAll(async () => {
  await ui?.close();
});

/*
 * Protects: the page names what it tests (issues #262, #448): the install target `lab:use`
 * recorded, and whether the live model is available. Without a key (or in CI) the page says
 * why, and the API refuses a live run (`409`) before any engine runs, never falling back to
 * replay.
 * Catches: a page that names a stale or hard-coded target, so a contributor reads one
 * version's results as another's; and a live run with no key that silently replays, or starts
 * every engine only for each to fail.
 * Not covered elsewhere: `lab ask` prints its target; nothing checks the page's.
 * `record.test.ts` owns `liveSettings`' CI and no-key rules; this checks the page acting on them.
 */
it("[postgres] lab-ui-page: names the install target, and why the live model is unavailable", async () => {
  const page = await studioRequest(ui);
  const shown = (id: string) => new RegExp(`<dd id="${id}">([^<]*)</dd>`).exec(page.text)?.[1];

  expect(page.status).toBe(200);
  expect(shown("target")).toBe(requireInstallTarget().label);
  expect(shown("live-model")).toMatch(/^unavailable: live mode needs an OpenAI API key and found none/);
});

it("[postgres] lab-ui-page: refuses a live run without a key, running no engine", async () => {
  // Checked first, so a server that found a key fails here instead of making a paid call.
  expect(/<dd id="live-model">unavailable: /.test((await studioRequest(ui)).text), "lab ui found a key: refusing to send a live run").toBe(true);
  const reply = await studioRequest(ui, {
    method: "POST",
    path: "/api/run",
    headers: { "content-type": "application/json", origin: ui.origin },
    body: JSON.stringify({ question: AGENCY_NAMES, model: "live" }),
  });

  expect(reply.status).toBe(409);
  expect(reply.text).toMatch(/^lab ui: the live model is unavailable: live mode needs an OpenAI API key/);
});

/*
 * Protects: the local-server rules issue #262 takes from ADR 0009: the server listens on
 * 127.0.0.1 only, never a wildcard address, and refuses a foreign `Host` on every request,
 * the page included (DNS rebinding). `POST /api/run` also refuses a cross-site `Origin` and a
 * body that isn't `application/json` (a CORS-simple cross-site POST).
 * Catches: a bind to `0.0.0.0` or `::` that exposes the lab to the network, a Host check
 * missing from the page or the API, and cross-site requests that make the browser run SQL.
 * Not covered elsewhere: the Studio suite checks Studio's guard, not the lab's.
 * Each refusal is one header away from a request the same test shows getting past the
 * guards (the page, `200`; an empty input, `400` from the input check after them).
 */
it("[postgres] lab-ui-local-only: listens on loopback only", async () => {
  const lan = Object.values(networkInterfaces()).flat().find((a) => a && a.family === "IPv4" && !a.internal)?.address;
  expect(lan, "no non-loopback IPv4 interface to try the port on").toBeDefined();
  const reaches = (host: string) =>
    new Promise<boolean>((resolve) => {
      const socket = connect({ host, port: ui.port });
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => resolve(false));
    });

  expect(await reaches("127.0.0.1")).toBe(true);
  expect(await reaches(lan!)).toBe(false);
});

const PAGE = { method: "GET", path: "/", body: undefined, passes: 200 };
const API = { method: "POST", path: "/api/run", body: "{}", passes: 400 };
/** The headers the page itself sends. */
const pageHeaders = () => ({ host: `127.0.0.1:${ui.port}`, origin: ui.origin, "content-type": "application/json" });

it.for([
  ["the page from a rebound Host", PAGE, { host: "rebound.example" }, 403],
  ["the API from a rebound Host", API, { host: "rebound.example" }, 403],
  ["the API from a cross-site Origin", API, { origin: "https://evil.example" }, 403],
  ["the API with a text/plain body", API, { "content-type": "text/plain" }, 415],
] as const)("[postgres] lab-ui-local-only: refuses %s", async ([, route, change, status]) => {
  const send = (headers: Record<string, string>) => studioRequest(ui, { method: route.method, path: route.path, body: route.body, headers });
  const own = pageHeaders();
  const changed = { ...own, ...change, ...("host" in change ? { host: `${change.host}:${ui.port}` } : {}) };

  expect((await send(own)).status).toBe(route.passes);
  expect((await send(changed)).status).toBe(status);
});
