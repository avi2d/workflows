import { Data, Effect } from "effect";
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { runMain } from "../lib/run-main.ts";

export class MutationScopeError extends Data.TaggedError("MutationScopeError")<{ readonly message: string }> {}

export function baseBranchOf(baseRef: string | undefined): string {
  return `origin/${baseRef === undefined || baseRef === "" ? "main" : baseRef}`;
}

function run(argv: readonly string[], stdout: "pipe" | "inherit"): Effect.Effect<string, MutationScopeError> {
  return Effect.try({
    try: () => Bun.spawnSync([...argv], { stdout, stderr: "inherit" }),
    catch: (cause) => new MutationScopeError({ message: `mutation-scope cannot start ${argv[0] ?? ""}: ${String(cause)}` }),
  }).pipe(
    Effect.flatMap((result) =>
      result.exitCode === 0
        ? Effect.succeed(result.stdout?.toString() ?? "")
        : Effect.fail(new MutationScopeError({ message: `mutation-scope: ${argv.join(" ")} exited ${String(result.exitCode)}` })),
    ),
  );
}

function required(name: string): Effect.Effect<string, MutationScopeError> {
  const value = process.env[name];
  return value === undefined || value === "" ? Effect.fail(new MutationScopeError({ message: `mutation-scope needs ${name} set` })) : Effect.succeed(value);
}

const main = Effect.gen(function* () {
  const report = join(yield* required("RUNNER_TEMP"), "baseline-full", "mutation.json");
  const githubEnv = yield* required("GITHUB_ENV");
  const base = (yield* run(["git", "merge-base", "HEAD", baseBranchOf(process.env["BASE_REF"])], "pipe")).trim();
  yield* run(["checks-mutation-baseline", "--full", report], "inherit");
  const scope = yield* run(["checks-mutation-scope", base, report], "pipe");
  yield* Effect.try({
    try: () => appendFileSync(githubEnv, scope),
    catch: (cause) => new MutationScopeError({ message: `mutation-scope cannot write GITHUB_ENV: ${String(cause)}` }),
  });
});

if (import.meta.main) runMain(main);
