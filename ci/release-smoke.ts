#!/usr/bin/env bun
import { Config, Console, Duration, Effect, Option, Schema } from "effect";
import { commandOutput, runCheck } from "../lib/run.ts";
import { writeOutputs } from "../lib/step-output.ts";
import { readUntil } from "../lib/wait.ts";

const POLL_TRIES = 60;
const POLL_WAIT = Duration.seconds(10);

const WORKFLOW = "release-smoke.yml";

class SmokeUnread extends Schema.TaggedError<SmokeUnread>()("SmokeUnread", {
  message: Schema.String,
}) {}

const Dispatched = Schema.Struct({ workflow_run_id: Schema.Finite });

const Run = Schema.Struct({ status: Schema.NullOr(Schema.String), head_sha: Schema.String });

export type Run = typeof Run.Type;

const decodeDispatched = Schema.decodeUnknownEffect(Schema.fromJsonString(Dispatched));

const decodeRun = Schema.decodeUnknownEffect(Schema.fromJsonString(Run));

export const waitForRun = <E, R>(read: Effect.Effect<Run, E, R>) => readUntil(read, (run) => run.status === "completed", POLL_TRIES, POLL_WAIT);

export function runProblem(run: Run, headSha: string): Option.Option<string> {
  if (run.status !== "completed") {
    return Option.some(`the release smoke is ${run.status ?? "unstarted"} after ${POLL_TRIES} reads, where completed was wanted`);
  }
  if (run.head_sha !== headSha) return Option.some(`the release smoke ran ${run.head_sha}, where the head ${headSha} was wanted`);
  return Option.none();
}

// Without return_run_details the dispatch answers nothing, and the run would have to be guessed from the run list.
const dispatch = Effect.fn("dispatch")(function* (repository: string, ref: string) {
  const { stdout, passed } = yield* commandOutput("gh", [
    "api",
    "--method",
    "POST",
    `repos/${repository}/actions/workflows/${WORKFLOW}/dispatches`,
    "-f",
    `ref=${ref}`,
    "-F",
    "return_run_details=true",
  ]);
  if (!passed) return yield* new SmokeUnread({ message: `gh api could not start ${WORKFLOW} on ${ref}` });
  return (yield* decodeDispatched(stdout)).workflow_run_id;
});

const readRun = Effect.fn("readRun")(function* (repository: string, runId: number) {
  const { stdout, passed } = yield* commandOutput("gh", ["api", `repos/${repository}/actions/runs/${runId}`]);
  if (!passed) return yield* new SmokeUnread({ message: `gh api could not read run ${runId}` });
  return yield* decodeRun(stdout);
});

const check = Effect.gen(function* () {
  const { repository, ref, headSha } = yield* Config.all({
    repository: Config.String("GITHUB_REPOSITORY"),
    ref: Config.String("REF"),
    headSha: Config.String("HEAD_SHA"),
  });
  const runId = yield* dispatch(repository, ref);
  yield* Console.log(`${WORKFLOW} run ${runId} on ${ref}`);
  yield* writeOutputs({ "run-id": String(runId) });
  const problem = runProblem(yield* waitForRun(readRun(repository, runId)), headSha);
  if (Option.isSome(problem)) yield* Console.log(`::error::${problem.value}`);
  return Option.isNone(problem);
});

if (import.meta.main) runCheck(check);
