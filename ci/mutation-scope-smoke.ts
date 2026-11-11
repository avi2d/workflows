import { Console, Data, Effect } from "effect";
import { appendFileSync, chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runMain } from "../lib/run-main.ts";

export const STAND_INS: Readonly<Record<string, string>> = {
  "checks-mutation-scope": '#!/bin/sh\necho "SCOPE=$1"\n',
};

export class MutationScopeSmokeError extends Data.TaggedError("MutationScopeSmokeError")<{ readonly message: string }> {}

export function writeStandIns(binDir: string): Effect.Effect<void, MutationScopeSmokeError> {
  return Effect.try({
    try: () => {
      mkdirSync(binDir, { recursive: true });
      for (const [name, body] of Object.entries(STAND_INS)) {
        writeFileSync(join(binDir, name), body);
        chmodSync(join(binDir, name), 0o755);
      }
    },
    catch: (cause) => new MutationScopeSmokeError({ message: `mutation-scope-smoke cannot write the stand-ins: ${String(cause)}` }),
  });
}

export function scopeFailure(scope: string | undefined, mainMergeBase: string): string | undefined {
  if (mainMergeBase === "") return "mutation-scope-smoke found no merge base with origin/main";
  return scope === mainMergeBase ? undefined : `mutation-scope wrote SCOPE=${scope ?? ""}, not the merge base with origin/main ${mainMergeBase}`;
}

function required(name: string): Effect.Effect<string, MutationScopeSmokeError> {
  const value = process.env[name];
  return value === undefined || value === "" ? Effect.fail(new MutationScopeSmokeError({ message: `mutation-scope-smoke needs ${name} set` })) : Effect.succeed(value);
}

const standIns = Effect.gen(function* () {
  const binDir = join(yield* required("RUNNER_TEMP"), "stand-in-bin");
  const githubPath = yield* required("GITHUB_PATH");
  yield* writeStandIns(binDir);
  yield* Effect.try({
    try: () => appendFileSync(githubPath, `${binDir}\n`),
    catch: (cause) => new MutationScopeSmokeError({ message: `mutation-scope-smoke cannot write GITHUB_PATH: ${String(cause)}` }),
  });
});

const verify = Effect.gen(function* () {
  const mainMergeBase = Bun.spawnSync(["git", "merge-base", "HEAD", "origin/main"]).stdout.toString().trim();
  const failure = scopeFailure(process.env["SCOPE"], mainMergeBase);
  if (failure !== undefined) return yield* new MutationScopeSmokeError({ message: failure });
  yield* Console.log(`mutation-scope-smoke: SCOPE is the merge base with origin/main, ${mainMergeBase}`);
});

const main = Effect.gen(function* () {
  const mode = process.argv[2];
  if (mode === "stand-ins") return yield* standIns;
  if (mode === "verify") return yield* verify;
  return yield* new MutationScopeSmokeError({ message: `mutation-scope-smoke takes stand-ins or verify, not ${mode ?? "nothing"}` });
});

if (import.meta.main) runMain(main);
