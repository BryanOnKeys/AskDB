// Each Studio spec file gets its own run (its own project, ports and Studio), so one screen's
// saves never change another screen's counts.
import { test } from "@playwright/test";
import { AskdbRun, introspectedRun } from "../run.js";

export { expect, test } from "@playwright/test";

/**
 * Register a run for this spec file: by default shop.db introspected into `askdb/` and Studio
 * started on it. `setup` replaces that, for a run that needs another starting state.
 */
export function studioRun(setup?: () => Promise<AskdbRun>): { readonly run: AskdbRun; readonly url: string } {
  let run: AskdbRun | undefined;
  test.beforeAll(async () => {
    run = setup ? await setup() : await introspectedRun();
    if (!setup) await run.start("studio", "askdb");
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
