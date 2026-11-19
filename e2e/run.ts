// Typed handle on the harness for the replay tests.
import { AskdbRun } from "./harness/askdb-run.mjs";

export { AskdbRun };

/**
 * A new run, prepared by `prepare`. If preparing throws, the run is cleaned up before the error
 * propagates: the caller never got the run, so its afterAll can't stop the fake model.
 */
export async function preparedRun(prepare: (run: AskdbRun) => Promise<void> | void): Promise<AskdbRun> {
  const run = await AskdbRun.create();
  try {
    await prepare(run);
    return run;
  } catch (error) {
    await run.cleanup();
    throw error;
  }
}

/** A run with shop.db introspected into `askdb/`, as most journeys need. */
export function introspectedRun(): Promise<AskdbRun> {
  return preparedRun((run) => {
    const result = run.cli(["introspect", "--engine", "sqlite", "--url", "shop.db", "--out", "askdb"], { label: "introspect-write" });
    if (result.exitCode !== 0) throw new Error(`introspect failed: ${result.stderr}`);
  });
}
