#!/usr/bin/env bun
import { Config, Console, Data, Effect, FileSystem } from "effect";
import { commandOutput, runCheck } from "../lib/run.ts";

class SetupSmokeError extends Data.TaggedError("SetupSmokeError")<{ readonly message: string }> {}

export function checkoutProblems({ shallow, head, want }: { shallow: string; head: string; want: string }): readonly string[] {
  return [
    ...(shallow === "false" ? [] : [`the checkout is shallow, where the whole history was asked for`]),
    ...(head === want ? [] : [`HEAD is ${head}, where ${want} was asked for`]),
  ];
}

export function bunVersionProblems({ running, pinned }: { running: string; pinned: string }): readonly string[] {
  const wanted = pinned.replace(/\n+$/, "");
  return running === wanted ? [] : [`Bun ${running} runs, where .bun-version names ${wanted}`];
}

export function dependencyProblems({ kitInstalled, diff }: { kitInstalled: boolean; diff: string }): readonly string[] {
  return [
    ...(kitInstalled ? [] : ["node_modules/.bin/checks-docs-only is missing or not executable"]),
    ...(diff === "" ? [] : ["the install changed tracked files"]),
  ];
}

const output = Effect.fn("output")(function* (program: string, args: readonly string[]) {
  const { stdout, passed } = yield* commandOutput(program, args);
  if (!passed) return yield* new SetupSmokeError({ message: `${program} ${args.join(" ")} failed` });
  return stdout.trim();
});

const checkout = Effect.gen(function* () {
  return checkoutProblems({
    shallow: yield* output("git", ["rev-parse", "--is-shallow-repository"]),
    head: yield* output("git", ["rev-parse", "HEAD"]),
    want: yield* Config.String("WANT"),
  });
});

const bunVersion = Effect.gen(function* () {
  const pinned = yield* (yield* FileSystem.FileSystem).readFileString(".bun-version");
  return bunVersionProblems({ running: Bun.version, pinned });
});

const dependencies = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const kitCommand = "node_modules/.bin/checks-docs-only";
  const kitInstalled = (yield* fs.exists(kitCommand)) && ((yield* fs.stat(kitCommand)).mode & 0o100) !== 0;
  const diff = yield* output("git", ["diff"]);
  if (diff !== "") yield* Console.log(diff);
  return dependencyProblems({ kitInstalled, diff });
});

const PARTS = { checkout, "bun-version": bunVersion, dependencies };

function isPart(mode: string | undefined): mode is keyof typeof PARTS {
  return mode !== undefined && Object.hasOwn(PARTS, mode);
}

const main = Effect.gen(function* () {
  const mode = process.argv[2];
  if (!isPart(mode)) return yield* new SetupSmokeError({ message: `setup-smoke takes ${Object.keys(PARTS).join(", ")}, not ${mode ?? "nothing"}` });
  const problems = yield* PARTS[mode];
  yield* Effect.forEach(problems, (problem) => Console.log(`::error::${problem}`));
  return problems.length === 0;
});

if (import.meta.main) runCheck(main);
