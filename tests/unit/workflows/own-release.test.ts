import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
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
  expect(inputs(onlyJob("own-release-pr.yml"))["plan-command"]).toBe("bunx checks-release-pr ci.yml");
});

test("a publish that never moves the major tag or never writes the release page fails", () => {
  const publish = inputs(onlyJob("own-release.yml"));
  expect(publish["github-release"]).toBe(true);
  const command = String(publish["publish-command"]);
  expect(command).toBe("bun release/major-tag.ts");
  expect(existsSync(join(REPOSITORY, command.split(" ")[1] ?? ""))).toBe(true);
});

test("a moving major tag such as v2 that starts a release run of its own fails", () => {
  const push = triggers("own-release.yml")["push"];
  const patterns = isRecord(push) && Array.isArray(push["tags"]) ? push["tags"] : [];
  expect(patterns).toEqual(["v[0-9]+.[0-9]+.[0-9]+"]);
});

test("a build that the release pull request and the tag check run but package.json does not name fails", () => {
  const manifest: unknown = JSON.parse(readFileSync(join(REPOSITORY, "package.json"), "utf8"));
  const scripts = isRecord(manifest) && isRecord(manifest["scripts"]) ? manifest["scripts"] : {};
  expect(scripts["build"]).toBe("bun release/changelog.ts");
});
