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

function publishSteps(): Record<string, unknown>[] {
  const document: unknown = Bun.YAML.parse(readFileSync(RELEASE, "utf8"));
  const jobs = isRecord(document) ? document["jobs"] : undefined;
  const publish = isRecord(jobs) ? jobs["publish"] : undefined;
  const steps: unknown[] = isRecord(publish) && Array.isArray(publish["steps"]) ? publish["steps"] : [];
  return steps.filter(isRecord);
}

function publishStep(name: string): Record<string, unknown> {
  const step = publishSteps().find((candidate) => candidate["name"] === name);
  if (step === undefined) throw new Error(`release.yml publish has no step named ${name}`);
  return step;
}

function publishRun(name: string): string {
  const run = publishStep(name)["run"];
  if (typeof run !== "string") throw new Error(`release.yml publish has no run step named ${name}`);
  return run;
}

function runnerFor(changelog: string): (run: string) => number {
  mkdirSync(scratch.at("temp"), { recursive: true });
  scratch.write("CHANGELOG.md", changelog);
  stubBin(scratch.at("bin"), "gh", "exit 0");
  stubBin(scratch.at("bin"), "publish-stub", "exit 0");
  const env = {
    ...process.env,
    PATH: `${scratch.at("bin")}:${join(REPOSITORY, "node_modules/.bin")}:${process.env["PATH"] ?? ""}`,
    STUB_RECORD: scratch.at("calls"),
    RUNNER_TEMP: scratch.at("temp"),
    GITHUB_REF_NAME: "v1.2.3",
    VERSION: "1.2.3",
  };
  return (run) => Bun.spawnSync(["bash", "-e", "-c", run], { cwd: scratch.at(), env }).exitCode;
}

function runStep(name: string): number {
  return runnerFor(CHANGELOG)(publishRun(name));
}

type Inputs = { readonly "publish-command": string; readonly "github-release": boolean };

// Every if the publish job holds must be listed, so a new condition fails the walk instead of being guessed.
function runsFor(condition: unknown, inputs: Inputs): boolean {
  const picked: Record<string, boolean> = {
    "": true,
    "inputs.publish-command == '' && !inputs.github-release": inputs["publish-command"] === "" && !inputs["github-release"],
    "inputs.github-release": inputs["github-release"],
    "inputs.publish-command != ''": inputs["publish-command"] !== "",
    "inputs.build-command != ''": false,
    "inputs.clean-tree-command != ''": false,
    "inputs.node-version != ''": false,
  };
  const key = String(condition ?? "");
  const runs = picked[key];
  if (runs === undefined) throw new Error(`release.yml publish has a step condition the walk does not know: ${key}`);
  return runs;
}

function walkPublishJob(inputs: Inputs, changelog: string): { readonly failed: boolean } {
  const runStepScript = runnerFor(changelog);
  for (const step of publishSteps()) {
    if (!runsFor(step["if"], inputs) || typeof step["run"] !== "string") continue;
    const run = step["run"].replace("${{ inputs.publish-command }}", inputs["publish-command"]);
    if (runStepScript(run) !== 0) return { failed: true };
  }
  return { failed: false };
}

const WITHOUT_SECTION = CHANGELOG.replace("## 1.2.3", "## 1.2.3-draft");

test("a GitHub release opt-in that runs the publish command although the notes cannot be written fails", () => {
  expect(walkPublishJob({ "publish-command": "publish-stub", "github-release": true }, WITHOUT_SECTION)).toEqual({ failed: true });
  expect(recordedCalls(scratch.at("calls"))).toEqual([]);
});

test("a GitHub release opt-in that creates the release before the publish command or skips either fails", () => {
  expect(walkPublishJob({ "publish-command": "publish-stub", "github-release": true }, CHANGELOG)).toEqual({ failed: false });
  expect(recordedCalls(scratch.at("calls"))).toEqual([[], ["release", "create", "v1.2.3", "--title", "v1.2.3", "--notes-file", scratch.at("temp", "release-notes.md")]]);
});

test("a caller with only a publish command whose job writes notes or creates a GitHub release fails", () => {
  expect(walkPublishJob({ "publish-command": "publish-stub", "github-release": false }, WITHOUT_SECTION)).toEqual({ failed: false });
  expect(recordedCalls(scratch.at("calls"))).toEqual([[]]);
});

test("a publish with no publish command and no GitHub release that passes fails", () => {
  const step = publishStep("require publish-command or github-release");
  expect(step["if"]).toBe("inputs.publish-command == '' && !inputs.github-release");
  expect(Bun.spawnSync(["bash", "-e", "-c", String(step["run"])], { cwd: scratch.at() }).exitCode).toBe(1);
});

test("a GitHub release whose notes hold another version's section or the surrounding blank lines fails", () => {
  expect(runStep("write the release notes")).toBe(0);
  expect(scratch.read("temp/release-notes.md")).toBe("Released 2026-11-10.\n\n- **release:** the change");
});

test("a GitHub release created for another tag, under another title or without the notes file fails", () => {
  expect(runStep("create the GitHub release")).toBe(0);
  expect(recordedCalls(scratch.at("calls"))).toEqual([["release", "create", "v1.2.3", "--title", "v1.2.3", "--notes-file", scratch.at("temp", "release-notes.md")]]);
});
