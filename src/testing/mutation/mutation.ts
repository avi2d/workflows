import { Config, Console, Data, Effect, FileSystem, Path, Schema } from "effect";
import { commandOutput } from "../../lib/run.ts";
import {
  advisoryComment,
  overCapNote,
  Report,
  scopedFiles,
  scopedMutants,
  scoreOf,
  scoreSummary,
  shardsOf,
  withoutStaleTests,
} from "./report.ts";

class MutationStepError extends Data.TaggedError("MutationStepError")<{ readonly message: string }> {}

const HEAD_REPORT = "reports/mutation/mutation.json";
const INCREMENTAL_STATE = "reports/stryker-incremental.json";

const decodeReport = Schema.decodeUnknownEffect(Schema.fromJsonString(Report));
const decodeJson = Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown));

const readReport = Effect.fn("readReport")(function* (file: string) {
  const fs = yield* FileSystem.FileSystem;
  if (!(yield* fs.exists(file))) return undefined;
  return yield* decodeReport(yield* fs.readFileString(file)).pipe(
    Effect.mapError(() => new MutationStepError({ message: `${file} is not a mutation report` })),
  );
});

const appendTo = Effect.fn("appendTo")(function* (variable: string, text: string) {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.writeFileString(yield* Config.String(variable), text, { flag: "a" });
});

const inRunnerTemp = Effect.fn("inRunnerTemp")(function* (...parts: readonly string[]) {
  const path = yield* Path.Path;
  return path.join(yield* Config.String("RUNNER_TEMP"), ...parts);
});

const kitCommand = Effect.fn("kitCommand")(function* (program: string, args: readonly string[]) {
  const { stdout, passed } = yield* commandOutput(program, args);
  if (!passed) return yield* new MutationStepError({ message: `${program} ${args.join(" ")} failed` });
  return stdout;
});

const writeComment = Effect.fn("writeComment")(function* (comment: string) {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.writeFileString(yield* inRunnerTemp("comment.md"), comment);
  yield* appendTo("GITHUB_ENV", "COMMENT=true\n");
});

const score = Effect.gen(function* () {
  const mode = yield* Config.String("MODE");
  yield* appendTo("GITHUB_STEP_SUMMARY", scoreSummary(`mutation ${mode}`, yield* readReport(HEAD_REPORT)));
});

const countScope = Effect.gen(function* () {
  const scope = yield* Config.String("SCOPE");
  const cap = yield* Config.Int("MUTANT_CAP");
  const scoped = scopedMutants(yield* readReport(yield* inRunnerTemp("baseline-full", "mutation.json")), scope);
  yield* appendTo("GITHUB_ENV", `SCOPED_MUTANTS=${scoped}\n${scoped > cap ? "OVER_CAP=true\n" : ""}`);
});

const overCap = Effect.gen(function* () {
  const scoped = yield* Config.Int("SCOPED_MUTANTS");
  const cap = yield* Config.Int("MUTANT_CAP");
  yield* Console.log(`::notice::mutation: ${scoped} scoped mutants pass the ${cap} mutant cap, so the run stops here`);
  yield* writeComment(overCapNote(scoped, cap));
});

const dropStaleTests = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const stale = yield* Config.String("STALE_TESTS");
  if (!(yield* fs.exists(INCREMENTAL_STATE))) return;
  const state = yield* decodeJson(yield* fs.readFileString(INCREMENTAL_STATE)).pipe(
    Effect.mapError(() => new MutationStepError({ message: `${INCREMENTAL_STATE} is not JSON` })),
  );
  yield* fs.writeFileString(INCREMENTAL_STATE, `${JSON.stringify(withoutStaleTests(state, stale), null, 2)}\n`);
});

const compare = Effect.gen(function* () {
  const baseline = yield* inRunnerTemp("baseline", "mutation.json");
  if (!(yield* (yield* FileSystem.FileSystem).exists(baseline))) {
    yield* Console.log("::notice::mutation: no baseline report restores, so the comparison stops here");
    return;
  }
  const compared = yield* kitCommand("checks-mutation-compare", ["--advisory", baseline, HEAD_REPORT]);
  yield* Console.log(compared.replace(/\n$/, ""));
  const head = yield* readReport(HEAD_REPORT);
  if (head === undefined) return yield* new MutationStepError({ message: `${HEAD_REPORT} was not written` });
  yield* writeComment(advisoryComment(scoreOf(scopedFiles(head.files, yield* Config.String("SCOPE"))), compared));
});

const shards = Effect.gen(function* () {
  const count = yield* Config.Int("SHARDS");
  const lastFull = yield* inRunnerTemp("last-full", "mutation.json");
  const known = (yield* (yield* FileSystem.FileSystem).exists(lastFull)) ? [lastFull] : [];
  const line = shardsOf(yield* kitCommand("checks-mutation-scope", ["--shards", String(count), ...known]));
  if (line === undefined) return yield* new MutationStepError({ message: "checks-mutation-scope printed no SHARDS= line" });
  yield* appendTo("GITHUB_OUTPUT", `shards=${line}\n`);
});

const forkSummary = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  yield* appendTo("GITHUB_STEP_SUMMARY", yield* fs.readFileString(yield* inRunnerTemp("comment.md")));
});

const PARTS = {
  score,
  "count-scope": countScope,
  "over-cap": overCap,
  "drop-stale-tests": dropStaleTests,
  compare,
  shards,
  "fork-summary": forkSummary,
};

function isPart(part: string): part is keyof typeof PARTS {
  return Object.hasOwn(PARTS, part);
}

export const main = Effect.gen(function* () {
  const part = yield* Config.String("PART");
  if (!isPart(part)) return yield* new MutationStepError({ message: `part must be one of ${Object.keys(PARTS).join(", ")}, not '${part}'` });
  yield* PARTS[part];
  return true;
});
