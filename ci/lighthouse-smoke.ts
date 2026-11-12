#!/usr/bin/env bun
import { Config, Console, Data, Effect, FileSystem, Option, Path, Schema } from "effect";
import { Report, type Scores, scoresOf } from "../actions/lighthouse/scores.ts";
import { runCheck } from "../lib/run.ts";

class LighthouseSmokeError extends Data.TaggedError("LighthouseSmokeError")<{ readonly message: string }> {}

export const EXPECTED_REPORTS = ["01-index-run-1.json", "01-index-run-2.json", "02-faults-run-1.json", "02-faults-run-2.json"];
const FAULTS_REPORT = "02-faults-run-1.json";

export type Observed = {
  readonly outcome: string;
  readonly reports: ReadonlyMap<string, Scores | undefined>;
};

export function smokeFailures({ outcome, reports }: Observed): readonly string[] {
  const failures: string[] = [];
  if (outcome !== "success") failures.push(`the action ended in ${outcome}, though no score may fail it`);
  const missing = EXPECTED_REPORTS.filter((name) => !reports.has(name));
  if (missing.length > 0) failures.push(`no report ${missing.join(", ")}`);
  const extra = [...reports.keys()].filter((name) => !EXPECTED_REPORTS.includes(name));
  if (extra.length > 0) failures.push(`unexpected report ${extra.join(", ")}`);
  for (const [name, scores] of reports) {
    if (scores === undefined) failures.push(`${name} is not a Lighthouse report`);
    else {
      const unscored = Object.entries(scores).filter(([, score]) => score === null);
      if (unscored.length > 0) failures.push(`${name} has no ${unscored.map(([category]) => category).join(", ")} score`);
    }
  }
  const faults = reports.get(FAULTS_REPORT)?.accessibility;
  if (typeof faults === "number" && faults >= 100) failures.push(`the faults page scored accessibility ${String(faults)}, so no low score was seen to pass`);
  return failures;
}

const decodeReport = Schema.decodeUnknownOption(Schema.fromJsonString(Report));

const verify = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const folder = yield* Config.String("REPORTS").pipe(Config.withDefault(""));
  const names = folder === "" ? [] : yield* fs.readDirectory(folder);
  const reports = new Map<string, Scores | undefined>();
  for (const name of names) {
    const text = yield* fs.readFileString(path.join(folder, name));
    reports.set(name, Option.getOrUndefined(Option.map(decodeReport(text), scoresOf)));
  }
  const failures = smokeFailures({ outcome: yield* Config.String("OUTCOME").pipe(Config.withDefault("")), reports });
  if (failures.length > 0) return yield* new LighthouseSmokeError({ message: failures.join("; ") });
  yield* Console.log(`lighthouse-smoke: ${String(reports.size)} reports each hold four scores, and the faults page passed at accessibility ${String(reports.get(FAULTS_REPORT)?.accessibility)}`);
  return true;
});

if (import.meta.main) runCheck(verify);
