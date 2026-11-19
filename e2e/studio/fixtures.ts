// The Studio run global-setup.ts started, for each UI replay.
import { test as base } from "@playwright/test";
import { AskdbRun } from "../run.js";

export const test = base.extend<{ run: AskdbRun; studioUrl: string }>({
  run: async ({}, use) => {
    await use(AskdbRun.load(process.env.ASKDB_E2E_STUDIO_RUN!));
  },
  studioUrl: async ({}, use) => {
    await use(process.env.ASKDB_E2E_STUDIO_URL!);
  },
});
export { expect } from "@playwright/test";
