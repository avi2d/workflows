import { Config, Console, Data, Effect, FileSystem, Path, Schema } from "effect";
import { commandOutput } from "../../lib/run.ts";
import { mutantCount } from "./count.ts";
import { overCapNote, Report, scopeComment, scopedFiles, scopeFiles, scoreSummary, shardsOf } from "./report.ts";

class MutationStepError extends Data.TaggedError("MutationStepError")<{ readonly message: string }> {}

const HEAD_REPORT = "reports/mutation/mutation.json";

const decodeReport = Schema.decodeUnknownEffect(Schema.fromJsonString(Report));

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
  const fs = yield* FileSystem.FileSystem;
  const atHead = yield* Effect.filter(scopeFiles(scope), (name) => fs.exists(name));
  const files = yield* Effect.forEach(atHead, (name) => fs.readFileString(name).pipe(Effect.map((content) => ({ name, content }))));
  const scoped = yield* mutantCount(files);
  yield* appendTo("GITHUB_ENV", `SCOPED_MUTANTS=${scoped}\n${scoped > cap ? "OVER_CAP=true\n" : ""}`);
});

const overCap = Effect.gen(function* () {
  const scoped = yield* Config.Int("SCOPED_MUTANTS");
  const cap = yield* Config.Int("MUTANT_CAP");
  yield* Console.log(`::notice::mutation: ${scoped} scoped mutants pass the ${cap} mutant cap, so the run stops here`);
  yield* writeComment(overCapNote(scoped, cap));
});

const scopeScore = Effect.gen(function* () {
  const head = yield* readReport(HEAD_REPORT);
  if (head === undefined) return yield* new MutationStepError({ message: `${HEAD_REPORT} was not written` });
  const comment = scopeComment(scopedFiles(head.files, yield* Config.String("SCOPE")));
  yield* Console.log(comment.replace(/\n$/, ""));
  yield* writeComment(comment);
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
  "scope-score": scopeScore,
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
