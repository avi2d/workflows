#!/usr/bin/env bun
import { Config, Console, Effect, Schema } from "effect";
import { commandOutput, runCheck } from "../lib/run.ts";

class ReleaseJobsUnread extends Schema.TaggedError<ReleaseJobsUnread>()("ReleaseJobsUnread", {
  message: Schema.String,
}) {}

const Job = Schema.Struct({ name: Schema.String, conclusion: Schema.NullOr(Schema.String), labels: Schema.Array(Schema.String) });

const decodeJob = Schema.decodeUnknownEffect(Schema.fromJsonString(Job));

export type Job = typeof Job.Type;

// A called workflow's job is listed as "<calling job> / <job>".
function jobNamed(jobs: readonly Job[], name: string): Job | undefined {
  return jobs.find((job) => job.name === name || job.name.endsWith(` / ${name}`));
}

function conclusionOf(jobs: readonly Job[], name: string): string {
  const found = jobNamed(jobs, name);
  return found === undefined ? "missing" : (found.conclusion ?? "unfinished");
}

// This repository sets no CI_RUNS_ON, so the plan stands for a caller that sets none.
function runnerProblems(jobs: readonly Job[]): string[] {
  const labels = jobNamed(jobs, "pull-request")?.labels;
  if (labels === undefined || (labels.length === 1 && labels[0] === "ubuntu-latest")) return [];
  return [`the pull-request job ran on [${labels.join(", ")}], where ubuntu-latest was wanted`];
}

export function releaseJobProblems(jobs: readonly Job[]): string[] {
  const wanted: readonly (readonly [string, string])[] = [
    ["pull-request", "success"],
    ["tag", "skipped"],
  ];
  const conclusions = wanted.flatMap(([name, conclusion]) => {
    const got = conclusionOf(jobs, name);
    return got === conclusion ? [] : [`the ${name} job is ${got}, where ${conclusion} was wanted`];
  });
  return [...conclusions, ...runnerProblems(jobs)];
}

const readJobs = Effect.fn("readJobs")(function* (repository: string, runId: string) {
  const { stdout, passed } = yield* commandOutput("gh", [
    "api",
    `repos/${repository}/actions/runs/${runId}/jobs?per_page=100`,
    "--paginate",
    "--jq",
    ".jobs[] | {name, conclusion, labels}",
  ]);
  if (!passed) return yield* new ReleaseJobsUnread({ message: `gh api could not list the jobs of run ${runId}` });
  const lines = stdout.split("\n").filter((line) => line !== "");
  return yield* Effect.forEach(lines, (line) => decodeJob(line));
});

const check = Effect.gen(function* () {
  const jobs = yield* readJobs(yield* Config.String("GITHUB_REPOSITORY"), yield* Config.String("RUN_ID"));
  for (const job of jobs) yield* Console.log(`${job.name} ${job.conclusion ?? "unfinished"} [${job.labels.join(", ")}]`);
  const problems = releaseJobProblems(jobs);
  for (const problem of problems) yield* Console.log(`::error::${problem}`);
  return problems.length === 0;
});

if (import.meta.main) runCheck(check);
