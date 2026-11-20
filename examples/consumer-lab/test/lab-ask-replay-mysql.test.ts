/**
 * `pnpm lab ask --db mysql "<catalog question>"`: the replay model, end to end, on MySQL,
 * through both documented model paths.
 *
 * Each dialect has its own `lab-ask-replay-<dialect>.test.ts`, so vitest runs them on different
 * workers. The scenario and its authoring-gate answers (Protects, Catches, Not covered elsewhere,
 * No production seam) are in `support/lab-ask-replay.ts`, which they share.
 *
 * Needs the fixture (`pnpm fixture:up`) and an installed lab (`pnpm lab:use .`).
 */
import { describeLabAskReplay } from "./support/lab-ask-replay.js";

describeLabAskReplay("mysql");
