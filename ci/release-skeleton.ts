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

const RELEASE_VERSION = /^avi2d\/workflows\/actions\/release-version@[0-9a-f]{40}$/;

function uses(job: Record<string, unknown>): string[] {
  const steps = job["steps"];
  if (!Array.isArray(steps)) return [];
  return steps.flatMap((step) => (isRecord(step) && typeof step["uses"] === "string" ? [step["uses"]] : []));
}

// A step after the publish command that runs for every caller changes the release of a caller that never opted in.
function ungatedAfterPublish(publish: Record<string, unknown>): boolean {
  const steps = Array.isArray(publish["steps"]) ? publish["steps"] : [];
  const at = runs(publish).findIndex((run) => run.includes("inputs.publish-command"));
  return steps.slice(at + 1).some((step) => !isRecord(step) || !String(step["if"] ?? "").includes("inputs.github-release"));
}

const NO_OP_GUARD = "inputs.publish-command == '' && !inputs.github-release";

function hasNoOpGuard(publish: Record<string, unknown>): boolean {
  const steps = Array.isArray(publish["steps"]) ? publish["steps"] : [];
  return steps.some((step) => {
    if (!isRecord(step)) return false;
    const wording = String(step["name"] ?? "");
    return (
      step["if"] === NO_OP_GUARD &&
      step["run"] === "exit 1" &&
      wording.includes("publish-command") &&
      wording.includes("github-release")
    );
  });
}

function holdsPublishToken(job: Record<string, unknown>): boolean {
  const permissions = job["permissions"];
  return permissions === "write-all" || (isRecord(permissions) && permissions["id-token"] === "write");
}

function verifyFaults(verify: Record<string, unknown>): string[] {
  const found: string[] = [];
  if (verify["needs"] !== "preflight") found.push("verify runs without preflight");
  if (holdsPublishToken(verify)) found.push("verify holds the publish token");
  const steps = runs(verify);
  if (!steps[0]?.includes("GITHUB_REF_TYPE") || !steps[0]?.includes("tag")) found.push("verify refuses a non-tag anywhere but first");
  if (!steps.some((run) => run.includes("merge-base --is-ancestor"))) found.push("verify never checks the tag sits on main");
  if (!steps.some((run) => run.includes("tree-guard-command"))) found.push("verify never runs the tree guard");
  if (steps.some((run) => run.includes("inputs.publish-command"))) found.push("verify publishes beside its checks");
  if (!uses(verify).some((action) => RELEASE_VERSION.test(action))) found.push("verify never matches the tag to the manifest version");
  return found;
}

function publishFaults(publish: Record<string, unknown>): string[] {
  const found: string[] = [];
  if (publish["needs"] !== "verify") found.push("publish runs without verify");
  const steps = runs(publish);
  if (steps.some((run) => run === "bun run build" || run === "git diff --exit-code")) found.push("publish hard-codes a build or a dirty check");
  if (!steps.some((run) => run.includes("build-command"))) found.push("publish never runs the caller build command");
  if (!steps.some((run) => run.includes("clean-tree-command"))) found.push("publish never runs the caller clean tree command");
  for (const check of ["lint-command", "typecheck-command", "test-command", "tree-guard-command", "preflight-command"]) {
    if (steps.some((run) => run.includes(check))) found.push(`publish runs the caller ${check} beside the publish token`);
  }
  if (!hasNoOpGuard(publish)) found.push("publish passes with no publish command and no GitHub release");
  if (!steps.some((run) => run.includes("inputs.publish-command"))) found.push("publish never runs the caller publish command");
  else if (ungatedAfterPublish(publish)) found.push("publish runs a step after the caller publish command that the GitHub release does not gate");
  return found;
}

// A fork pull request reaches the release pull request through this repository's CI, so those jobs stay hosted.
const HOSTED_RUNNER = "ubuntu-latest";
// Any other runner expression can move a caller that sets no CI_RUNS_ON off ubuntu-latest.
const RUNNER_PICK = "${{ vars.CI_RUNS_ON || 'ubuntu-latest' }}";

export function offHostedJobs(document: unknown): string[] {
  const jobs = isRecord(document) && isRecord(document["jobs"]) ? document["jobs"] : {};
  return Object.entries(jobs)
    .filter(([, body]) => !isRecord(body) || body["runs-on"] !== HOSTED_RUNNER)
    .map(([name]) => name);
}

export function offPickJobs(document: unknown): string[] {
  const jobs = isRecord(document) && isRecord(document["jobs"]) ? document["jobs"] : {};
  return Object.entries(jobs)
    .filter(([, body]) => !isRecord(body) || body["runs-on"] !== RUNNER_PICK)
    .map(([name]) => name);
}

export function faults(prDocument: unknown, releaseDocument: unknown): string[] {
  const found = [
    ...offHostedJobs(prDocument).map((name) => `the ${name} job runs off the hosted runner`),
    ...offPickJobs(releaseDocument).map((name) => `the ${name} job runs off the caller's runner pick`),
  ];
  const tag = job(prDocument, "tag");
  if (tag === undefined) found.push("release-pr has no tag job");
  else if (!String(tag["if"] ?? "").includes("chore: release ")) found.push("tag runs off more than a release commit");
  const verify = job(releaseDocument, "verify");
  if (verify === undefined) found.push("release has no verify job");
  else found.push(...verifyFaults(verify));
  const publish = job(releaseDocument, "publish");
  if (publish === undefined) found.push("release has no publish job");
  else found.push(...publishFaults(publish));
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
  if (found.length === 0) yield* Console.log("release skeleton holds: tag gate, verify then publish, caller slots, hosted pull request, caller runner pick");
  return found.length === 0;
});

if (import.meta.main) runCheck(check);
