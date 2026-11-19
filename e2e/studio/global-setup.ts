// One run for every Studio UI replay: shop.db introspected into `askdb/`, Studio started on it.
// Workers read the run id and Studio's URL from the environment set here.
import { introspectedRun } from "../run.js";

export default async function globalSetup(): Promise<void> {
  const run = await introspectedRun();
  await run.start("studio", "askdb");
  process.env.ASKDB_E2E_STUDIO_RUN = run.id;
  process.env.ASKDB_E2E_STUDIO_URL = run.url("studio");
}
