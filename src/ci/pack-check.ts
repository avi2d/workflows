#!/usr/bin/env bun
import { Config, Console, Effect, FileSystem, Path, Schema } from "effect";
import { commandOutput, runCheck } from "../lib/run.ts";

const PACK_READ = "the private pack CHECKS_SECRETS_PACK names ran";

class PackUnchecked extends Schema.TaggedError<PackUnchecked>()("PackUnchecked", {
  message: Schema.String,
}) {}

type Written = {
  readonly exported: string;
  readonly runnerTemp: string;
  readonly pack: string;
  readonly contents: string;
  readonly scan: string;
};

export function packProblems({ exported, runnerTemp, pack, contents, scan }: Written): readonly string[] {
  const wantedPath = `${runnerTemp}/secrets-pack.json`;
  return [
    ...(exported === wantedPath ? [] : [`CHECKS_SECRETS_PACK names ${exported}, not ${wantedPath}`]),
    ...(contents === pack ? [] : ["the written pack differs from the pack input"]),
    ...(scan.includes(PACK_READ) ? [] : ["checks-secrets ran without the pack"]),
  ];
}

// The kit skips the pack on a run Dependabot starts, taking it for a secret GitHub withholds, but this job builds its pack.
const WITHOUT_THE_EVENT = { GITHUB_EVENT_PATH: "" };

const secretsScan = Effect.gen(function* () {
  const { stdout, passed } = yield* commandOutput("bunx", ["checks-secrets", "HEAD"], WITHOUT_THE_EVENT);
  yield* Console.log(stdout.trimEnd());
  if (!passed) return yield* new PackUnchecked({ message: "checks-secrets failed" });
  return stdout;
});

const check = Effect.gen(function* () {
  const env = yield* Config.all({
    exported: Config.String("CHECKS_SECRETS_PACK"),
    runnerTemp: Config.String("RUNNER_TEMP"),
    pack: Config.String("PACK"),
  });
  const exported = (yield* Path.Path).normalize(env.exported);
  const contents = yield* (yield* FileSystem.FileSystem).readFileString(exported);
  const problems = packProblems({ ...env, exported, contents, scan: yield* secretsScan });
  yield* Effect.forEach(problems, (problem) => Console.log(`::error::${problem}`));
  return problems.length === 0;
});

if (import.meta.main) runCheck(check);
