#!/usr/bin/env bun
import { Console, Data, Effect, FileSystem } from "effect";
import { runCheck } from "../lib/run.ts";

class ReleaseSkeletonError extends Data.TaggedError("ReleaseSkeletonError")<{ readonly message: string }> {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function job(document: unknown, name: string): Record<string, unknown> | undefined {
  if (!isRecord(document)) return undefined;
  const jobs = document["jobs"];
  if (!isRecord(jobs)) return undefined;
  const found = jobs[name];
  return isRecord(found) ? found : undefined;
}

function runs(job: Record<string, unknown>): string[] {
  const steps = job["steps"];
  if (!Array.isArray(steps)) return [];
  return steps.map((step) => (isRecord(step) ? String(step["run"] ?? "") : ""));
}

// The shared copy cannot tell a public caller from a private one, and a public caller's jobs must not reach a self-hosted runner.
export function offHostedJobs(document: unknown): string[] {
  const jobs = isRecord(document) && isRecord(document["jobs"]) ? document["jobs"] : {};
  return Object.entries(jobs)
    .filter(([, body]) => !isRecord(body) || body["runs-on"] !== "ubuntu-latest")
    .map(([name]) => name);
}

export function faults(prDocument: unknown, releaseDocument: unknown): string[] {
  const found = [...offHostedJobs(prDocument), ...offHostedJobs(releaseDocument)].map((name) => `the ${name} job runs off the hosted runner`);
  const tag = job(prDocument, "tag");
  if (tag === undefined) found.push("release-pr has no tag job");
  else if (!String(tag["if"] ?? "").includes("chore: release ")) found.push("tag runs off more than a release commit");
  const publish = job(releaseDocument, "publish");
  if (publish === undefined) {
    found.push("release has no publish job");
    return found;
  }
  if (publish["needs"] !== "preflight") found.push("publish runs without preflight");
  const steps = runs(publish);
  if (!steps[0]?.includes("GITHUB_REF_TYPE") || !steps[0]?.includes("tag")) found.push("publish refuses a non-tag anywhere but first");
  if (!steps.some((run) => run.includes("merge-base --is-ancestor"))) found.push("publish never checks the tag sits on main");
  if (!steps.some((run) => run.includes("tree-guard-command"))) found.push("publish never runs the tree guard");
  if (steps.some((run) => run === "bun run build" || run === "git diff --exit-code")) {
    found.push("publish hard-codes a build or a dirty check");
  }
  if (!steps.some((run) => run.includes("build-command"))) found.push("publish never runs the caller build command");
  if (!steps.some((run) => run.includes("clean-tree-command"))) found.push("publish never runs the caller clean tree command");
  if (!steps[steps.length - 1]?.includes("publish-command")) found.push("publish does not end in the caller publish command");
  return found;
}

const USAGE = "usage: release-skeleton.ts <release-pr.yml> <release.yml>";

const parsed = Effect.fn("parsed")(function* (path: string) {
  const text = yield* (yield* FileSystem.FileSystem).readFileString(path);
  return yield* Effect.try({
    try: (): unknown => Bun.YAML.parse(text),
    catch: (cause) => new ReleaseSkeletonError({ message: `release-skeleton cannot parse ${path}: ${String(cause)}` }),
  });
});

const check = Effect.gen(function* () {
  const [prPath, releasePath, ...extra] = process.argv.slice(2);
  if (prPath === undefined || releasePath === undefined || extra.length > 0) return yield* new ReleaseSkeletonError({ message: USAGE });
  const found = faults(yield* parsed(prPath), yield* parsed(releasePath));
  for (const fault of found) yield* Console.log(`::error::skeleton fault: ${fault}`);
  if (found.length === 0) yield* Console.log("release skeleton holds: tag gate, publish order, caller slots");
  return found.length === 0;
});

if (import.meta.main) runCheck(check);
