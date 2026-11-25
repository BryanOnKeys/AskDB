// Each Studio spec file gets its own run (its own project, ports and Studio), so one screen's
// saves never change another screen's counts.
import { test } from "@playwright/test";
import { type AskdbRun, preparedRun } from "../run.js";

export { expect, test } from "@playwright/test";

/** The default preparation: shop.db introspected into `askdb/`, and Studio started on it. */
async function introspectAndStartStudio(run: AskdbRun): Promise<void> {
  const result = run.cli(["introspect", "--engine", "sqlite", "--url", "shop.db", "--out", "askdb"], { label: "introspect-write" });
  if (result.exitCode !== 0) throw new Error(`introspect failed: ${result.stderr}`);
  await run.start("studio", "askdb");
}

/**
 * Register a run for this spec file, prepared by `prepare` (by default: introspect, then start
 * Studio). A preparation that throws cleans its run up before the error reaches the test.
 */
export function studioRun(prepare: (run: AskdbRun) => Promise<void> = introspectAndStartStudio): { readonly run: AskdbRun; readonly url: string } {
  let run: AskdbRun | undefined;
  test.beforeAll(async () => {
    run = await preparedRun(prepare);
  });
  test.afterAll(async () => {
    await run?.cleanup();
  });
  return {
    get run() {
      if (!run) throw new Error("the run starts in beforeAll");
      return run;
    },
    get url() {
      return this.run.url("studio");
    },
  };
}
