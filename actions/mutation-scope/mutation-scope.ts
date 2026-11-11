import { Console, Data, Effect, Schema } from "effect";
import { appendFileSync, readFileSync } from "node:fs";

export class MutationScopeError extends Data.TaggedError("MutationScopeError")<{ readonly message: string }> {}

const PullRequest = Schema.Struct({
  user: Schema.Struct({ type: Schema.String }),
  head: Schema.Struct({ ref: Schema.String, repo: Schema.NullOr(Schema.Struct({ full_name: Schema.String })) }),
  base: Schema.Struct({ ref: Schema.String, repo: Schema.Struct({ full_name: Schema.String }) }),
});

export type PullRequest = typeof PullRequest.Type;

const Event = Schema.Struct({ pull_request: Schema.optional(PullRequest) });

const decodeEvent = Schema.decodeUnknownEffect(Schema.fromJsonString(Event));

export type SkipReason = "release" | "bot" | "no-source";

const NOTES: Readonly<Record<SkipReason, string>> = {
  release: "mutation: a release pull request changes no source, so the run does not start",
  bot: "mutation: a bot opened the pull request, so the run does not start",
  "no-source": "mutation: no source files changed, so the run does not start",
};

export function skipNote(reason: SkipReason): string {
  return `::notice::${NOTES[reason]}`;
}

// A bot opens the release pull request, so the release check comes before the bot check.
export function pullRequestSkip(pullRequest: PullRequest | undefined): SkipReason | undefined {
  if (pullRequest === undefined) return undefined;
  const sameRepository = pullRequest.head.repo?.full_name === pullRequest.base.repo.full_name;
  if (sameRepository && pullRequest.head.ref === `release/${pullRequest.base.ref}`) return "release";
  if (pullRequest.user.type === "Bot") return "bot";
  return undefined;
}

export function scopesNoFile(envLines: string): boolean {
  return !envLines.split("\n").some((line) => line.startsWith("SCOPE=") && line.length > "SCOPE=".length);
}

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

export const pullRequestOfEvent = Effect.gen(function* () {
  const eventPath = process.env["GITHUB_EVENT_PATH"];
  if (eventPath === undefined || eventPath === "") return undefined;
  const text = yield* Effect.try({
    try: () => readFileSync(eventPath, "utf8"),
    catch: (cause) => new MutationScopeError({ message: `mutation-scope cannot read ${eventPath}: ${String(cause)}` }),
  });
  const event = yield* decodeEvent(text).pipe(
    Effect.mapError(() => new MutationScopeError({ message: `mutation-scope cannot read the pull request in ${eventPath}` })),
  );
  return event.pull_request;
});

function appendEnv(githubEnv: string, text: string): Effect.Effect<void, MutationScopeError> {
  return Effect.try({
    try: () => appendFileSync(githubEnv, text),
    catch: (cause) => new MutationScopeError({ message: `mutation-scope cannot write GITHUB_ENV: ${String(cause)}` }),
  });
}

function skip(githubEnv: string, reason: SkipReason): Effect.Effect<void, MutationScopeError> {
  return appendEnv(githubEnv, `SKIP=${reason}\n`).pipe(Effect.andThen(Console.log(skipNote(reason))));
}

export const main = Effect.gen(function* () {
  const githubEnv = yield* required("GITHUB_ENV");
  const pullRequestReason = pullRequestSkip(yield* pullRequestOfEvent);
  if (pullRequestReason !== undefined) return yield* skip(githubEnv, pullRequestReason);
  const base = (yield* run(["git", "merge-base", "HEAD", baseBranchOf(process.env["BASE_REF"])])).trim();
  const scope = yield* run(["checks-mutation-scope", base]);
  yield* appendEnv(githubEnv, scope === "" || scope.endsWith("\n") ? scope : `${scope}\n`);
  if (scopesNoFile(scope)) yield* skip(githubEnv, "no-source");
});
