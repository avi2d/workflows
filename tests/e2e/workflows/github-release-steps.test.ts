import { expect, test } from "bun:test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { useScratch } from "../lib/scratch.ts";
import { recordedCalls, stubBin } from "../lib/stub-bin.ts";

const REPOSITORY = join(import.meta.dir, "../../..");
const RELEASE = join(REPOSITORY, ".github/workflows/release.yml");
const CHANGELOG = ["# Changelog", "", "## 1.2.4", "", "- later", "", "## 1.2.3", "", "Released 2026-11-10.", "", "- **release:** the change", "", "", "## 1.2.2", "", "- earlier", ""].join("\n");

const scratch = useScratch("github-release-steps");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function publishRun(name: string): string {
  const document: unknown = Bun.YAML.parse(readFileSync(RELEASE, "utf8"));
  const jobs = isRecord(document) ? document["jobs"] : undefined;
  const publish = isRecord(jobs) ? jobs["publish"] : undefined;
  const steps: unknown[] = isRecord(publish) && Array.isArray(publish["steps"]) ? publish["steps"] : [];
  const step = steps.filter(isRecord).find((candidate) => candidate["name"] === name);
  if (typeof step?.["run"] !== "string") throw new Error(`release.yml publish has no run step named ${name}`);
  return step["run"];
}

function runStep(name: string): number {
  mkdirSync(scratch.at("temp"), { recursive: true });
  scratch.write("CHANGELOG.md", CHANGELOG);
  stubBin(scratch.at("bin"), "gh", "exit 0");
  const env = {
    ...process.env,
    PATH: `${scratch.at("bin")}:${join(REPOSITORY, "node_modules/.bin")}:${process.env["PATH"] ?? ""}`,
    STUB_RECORD: scratch.at("calls"),
    RUNNER_TEMP: scratch.at("temp"),
    GITHUB_REF_NAME: "v1.2.3",
    VERSION: "1.2.3",
  };
  return Bun.spawnSync(["bash", "-e", "-c", publishRun(name)], { cwd: scratch.at(), env }).exitCode;
}

test("a GitHub release whose notes hold another version's section or the surrounding blank lines fails", () => {
  expect(runStep("write the release notes")).toBe(0);
  expect(scratch.read("temp/release-notes.md")).toBe("Released 2026-11-10.\n\n- **release:** the change");
});

test("a GitHub release created for another tag, under another title or without the notes file fails", () => {
  expect(runStep("create the GitHub release")).toBe(0);
  expect(recordedCalls(scratch.at("calls"))).toEqual([["release", "create", "v1.2.3", "--title", "v1.2.3", "--notes-file", scratch.at("temp", "release-notes.md")]]);
});
