#!/usr/bin/env bun
import { Config, Console, Duration, Effect, Option, Schema } from "effect";
import { stateOf } from "../lib/commit-status.ts";
import { commandOutput, runCheck } from "../lib/run.ts";
import { readUntil } from "../lib/wait.ts";

export const READ_TRIES = 6;
export const READ_WAIT = Duration.seconds(5);

class StatusUnread extends Schema.TaggedError<StatusUnread>()("StatusUnread", {
  message: Schema.String,
}) {}

const Statuses = Schema.Array(
  Schema.Struct({ context: Schema.String, state: Schema.String, description: Schema.NullOr(Schema.String) }),
);

const decodeStatuses = Schema.decodeUnknownEffect(Schema.fromJsonString(Statuses));

export type Status = { readonly state: string; readonly description: string | null };

// GitHub lists a commit's statuses newest first, so the first match is the one a check counts.
export function newestStatus(statuses: typeof Statuses.Type, context: string): Option.Option<Status> {
  return Option.fromUndefinedOr(statuses.find((status) => status.context === context)).pipe(
    Option.map(({ state, description }) => ({ state, description })),
  );
}

// The statuses list can lag the write, so an empty read waits and reads again.
export const waitForStatus = <E, R>(read: Effect.Effect<Option.Option<Status>, E, R>, tries: number, wait: Duration.Duration) =>
  readUntil(read, Option.isSome, tries, wait);

export function statusProblem(found: Option.Option<Status>, state: string, description: Option.Option<string>): Option.Option<string> {
  if (Option.isNone(found)) return Option.some(`no status, where ${state} was wanted`);
  const { state: got, description: told } = found.value;
  if (got !== state) return Option.some(`${got}, where ${state} was wanted`);
  if (Option.isSome(description) && told !== description.value) {
    return Option.some(`the description ${JSON.stringify(told)}, where ${JSON.stringify(description.value)} was wanted`);
  }
  return Option.none();
}

const readStatus = Effect.fn("readStatus")(function* (repository: string, sha: string, context: string) {
  const { stdout, passed } = yield* commandOutput("gh", ["api", `repos/${repository}/commits/${sha}/statuses`]);
  if (!passed) return yield* new StatusUnread({ message: `gh api could not list the statuses of ${sha}` });
  return newestStatus(yield* decodeStatuses(stdout), context);
});

const USAGE = "usage: status-check.ts <sha> <context> <outcome> [<description>]";

const check = Effect.gen(function* () {
  const [sha, context, outcome, description, ...extra] = process.argv.slice(2);
  if (sha === undefined || sha === "" || context === undefined || outcome === undefined || extra.length > 0) {
    return yield* new StatusUnread({ message: USAGE });
  }
  const repository = yield* Config.String("GITHUB_REPOSITORY");
  const found = yield* waitForStatus(readStatus(repository, sha, context), READ_TRIES, READ_WAIT);
  const problem = statusProblem(found, stateOf(outcome), Option.fromUndefinedOr(description));
  yield* Console.log(`${context} on ${sha}: ${Option.getOrElse(problem, () => "as wanted")}`);
  return Option.isNone(problem);
});

if (import.meta.main) runCheck(check);
