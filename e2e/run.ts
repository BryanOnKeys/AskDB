// Typed handle on the harness for the replay tests.
import { AskdbRun } from "./harness/askdb-run.mjs";

export { AskdbRun };

/** A run with shop.db introspected into `askdb/`, as most journeys need. */
export async function introspectedRun(): Promise<AskdbRun> {
  const run = await AskdbRun.create();
  const result = run.cli(["introspect", "--engine", "sqlite", "--url", "shop.db", "--out", "askdb"], { label: "introspect-write" });
  if (result.exitCode !== 0) throw new Error(`introspect failed: ${result.stderr}`);
  return run;
}
