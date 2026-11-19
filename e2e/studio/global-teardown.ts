import { AskdbRun } from "../run.js";

export default async function globalTeardown(): Promise<void> {
  const id = process.env.ASKDB_E2E_STUDIO_RUN;
  if (id) await AskdbRun.load(id).cleanup();
}
