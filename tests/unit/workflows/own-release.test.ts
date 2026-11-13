import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { conditionRuns } from "../../lib/condition.ts";
import { isRecord } from "../../lib/workflow.ts";

const REPOSITORY = join(import.meta.dir, "../../..");

function onlyJob(file: string): Record<string, unknown> {
  const document: unknown = Bun.YAML.parse(readFileSync(join(REPOSITORY, ".github/workflows", file), "utf8"));
  const jobs = isRecord(document) && isRecord(document["jobs"]) ? Object.values(document["jobs"]) : [];
  const [job] = jobs;
  return jobs.length === 1 && isRecord(job) ? job : {};
}

function triggers(file: string): Record<string, unknown> {
  const document: unknown = Bun.YAML.parse(readFileSync(join(REPOSITORY, ".github/workflows", file), "utf8"));
  return isRecord(document) && isRecord(document["on"]) ? document["on"] : {};
}

function inputs(job: Record<string, unknown>): Record<string, unknown> {
  return isRecord(job["with"]) ? job["with"] : {};
}

function releaseJobs(): Record<string, unknown> {
  const document: unknown = Bun.YAML.parse(readFileSync(join(REPOSITORY, ".github/workflows/release.yml"), "utf8"));
  return isRecord(document) && isRecord(document["jobs"]) ? document["jobs"] : {};
}

function needsOf(job: Record<string, unknown>): readonly string[] {
  const needs = job["needs"];
  if (typeof needs === "string") return [needs];
  return Array.isArray(needs) ? needs.filter((need): need is string => typeof need === "string") : [];
}

function antecedents(jobs: Record<string, unknown>, name: string): readonly string[] {
  const seen = new Set<string>();
  const visit = (job: string): void => {
    const body = jobs[job];
    if (!isRecord(body)) return;
    for (const need of needsOf(body)) {
      if (!seen.has(need)) {
        seen.add(need);
        visit(need);
      }
    }
  };
  visit(name);
  return [...seen];
}

function unwrapped(condition: unknown): unknown {
  if (typeof condition !== "string") return condition;
  const start = "${{";
  const end = "}}";
  return condition.startsWith(start) && condition.endsWith(end)
    ? condition.slice(start.length, -end.length).trim()
    : condition;
}

function publishRuns(jobs: Record<string, unknown>, results: Record<string, string>, cancelled: boolean): boolean {
  const publish = isRecord(jobs["publish"]) ? jobs["publish"] : {};
  const prior = antecedents(jobs, "publish");
  const status = {
    always: true,
    cancelled,
    success: !cancelled && prior.every((job) => results[job] === "success"),
    failure: prior.some((job) => results[job] === "failure"),
  };
  const condition = unwrapped(publish["if"]);
  if (typeof condition !== "string" || condition.trim() === "") return status.success;
  const context = Object.fromEntries(
    Object.entries(results).map(([job, result]) => [`needs.${job}.result`, result]),
  );
  return conditionRuns(condition, context, status);
}

test("a release pull request that calls the shared copy at a pinned ref in place of this commit, or never runs on dispatch and on main, fails", () => {
  expect(onlyJob("own-release-pr.yml")["uses"]).toBe("./.github/workflows/release-pr.yml");
  expect(Object.keys(triggers("own-release-pr.yml")).toSorted()).toEqual(["push", "workflow_dispatch"]);
  expect(triggers("own-release-pr.yml")["push"]).toEqual({ branches: ["main"] });
});

test("a tag command that dispatches a workflow file that does not exist or takes no dispatch fails", () => {
  const command = String(inputs(onlyJob("own-release-pr.yml"))["tag-command"]);
  const dispatched = command.split(" ").at(-1) ?? "";
  expect(command).toBe(`bunx checks-release-tag ${dispatched}`);
  expect(onlyJob(dispatched)["uses"]).toBe("./.github/workflows/release.yml");
  expect(triggers(dispatched)).toHaveProperty("workflow_dispatch");
});

test("a plan that dispatches no ci.yml, so the release pull request runs no required check, fails", () => {
  const command = String(inputs(onlyJob("own-release-pr.yml"))["plan-command"]);
  const [runner, kit, dispatched] = command.split(" ");
  expect([runner, kit]).toEqual(["bunx", "checks-release-pr"]);
  expect(existsSync(join(REPOSITORY, ".github/workflows", dispatched ?? ""))).toBe(true);
  expect(triggers(dispatched ?? "")).toHaveProperty("workflow_dispatch");
});

test("a publish that never moves the major tag or never writes the release page fails", () => {
  const publish = inputs(onlyJob("own-release.yml"));
  expect(publish["github-release"]).toBe(true);
  const [runner, entry] = String(publish["publish-command"]).split(" ");
  expect(runner).toBe("bun");
  expect(existsSync(join(REPOSITORY, entry ?? ""))).toBe(true);
});

test("a publish that a skipped preflight keeps from running, or that runs after a verify that did not succeed, fails", () => {
  const jobs = releaseJobs();
  const publish = isRecord(jobs["publish"]) ? jobs["publish"] : {};
  expect(needsOf(publish)).toEqual(["verify"]);
  expect(publishRuns(jobs, { preflight: "skipped", verify: "success" }, false)).toBe(true);
  expect(publishRuns(jobs, { preflight: "success", verify: "success" }, false)).toBe(true);
  expect(publishRuns(jobs, { preflight: "success", verify: "failure" }, false)).toBe(false);
  expect(publishRuns(jobs, { preflight: "skipped", verify: "failure" }, false)).toBe(false);
  expect(publishRuns(jobs, { preflight: "success", verify: "cancelled" }, false)).toBe(false);
  expect(publishRuns(jobs, { preflight: "success", verify: "skipped" }, false)).toBe(false);
  expect(publishRuns(jobs, { preflight: "success", verify: "success" }, true)).toBe(false);
});

test("a build that the release pull request and the tag check run but package.json does not name fails", () => {
  const manifest: unknown = JSON.parse(readFileSync(join(REPOSITORY, "package.json"), "utf8"));
  const scripts = isRecord(manifest) && isRecord(manifest["scripts"]) ? manifest["scripts"] : {};
  const entry = String(scripts["build"] ?? "").split(" ").at(-1) ?? "";
  expect(entry).not.toBe("");
  expect(existsSync(join(REPOSITORY, entry))).toBe(true);
});
