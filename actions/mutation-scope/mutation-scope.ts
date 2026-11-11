import { Data, Effect } from "effect";
import { appendFileSync } from "node:fs";

export class MutationScopeError extends Data.TaggedError("MutationScopeError")<{ readonly message: string }> {}

export function baseBranchOf(baseRef: string | undefined): string {
  return `origin/${baseRef === undefined || baseRef === "" ? "main" : baseRef}`;
}

function run(argv: readonly string[]): Effect.Effect<string, MutationScopeError> {
  return Effect.try({
    try: () => Bun.spawnSync([...argv], { stdout: "pipe", stderr: "inherit" }),
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

export const main = Effect.gen(function* () {
  const githubEnv = yield* required("GITHUB_ENV");
  const base = (yield* run(["git", "merge-base", "HEAD", baseBranchOf(process.env["BASE_REF"])])).trim();
  const scope = yield* run(["checks-mutation-scope", base]);
  yield* Effect.try({
    try: () => appendFileSync(githubEnv, scope),
    catch: (cause) => new MutationScopeError({ message: `mutation-scope cannot write GITHUB_ENV: ${String(cause)}` }),
  });
});
