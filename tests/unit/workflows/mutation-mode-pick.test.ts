import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Context, conditionRuns } from "../../lib/condition.ts";
import { isRecord, needsOf } from "../../lib/workflow.ts";

const WORKFLOW = join(import.meta.dir, "../../../.github/workflows/mutation.yml");
const document: unknown = Bun.YAML.parse(readFileSync(WORKFLOW, "utf8"));

function at(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

const modeDefault = at(at(at(at(document, "on"), "workflow_call"), "inputs"), "mode");
const defaultMode = at(modeDefault, "default");
if (typeof defaultMode !== "string") throw new Error("mutation.yml declares no string default for mode");
const DEFAULT_MODE: string = defaultMode;

const jobsSection = at(document, "jobs");
const JOB_NAMES = isRecord(jobsSection) ? Object.keys(jobsSection) : [];

function jobNamed(name: string): Record<string, unknown> {
  const job = at(jobsSection, name);
  if (!isRecord(job)) throw new Error(`mutation.yml has no job ${name}`);
  return job;
}

function jobRuns(name: string, context: Context): boolean {
  const job = jobNamed(name);
  return conditionRuns(job["if"], context) && needsOf(job).every((need) => jobRuns(need, context));
}

function runsOn(context: Context): readonly string[] {
  return JOB_NAMES.filter((name) => jobRuns(name, context));
}

const BASELINE = ["baseline"];
const COMPARE = ["compare"];
const FULL_RUN_IN_PARTS = ["refresh-plan", "refresh-shard", "refresh-merge"];

function withNoInputs(event: string): Context {
  return { "github.event_name": event, "inputs.mode": DEFAULT_MODE };
}

test("a caller with no inputs that runs a baseline or a full run on a pull request fails", () => {
  expect(runsOn(withNoInputs("pull_request"))).toEqual(COMPARE);
});

test("a caller with no inputs that runs only the compare on a manual start fails", () => {
  expect(runsOn(withNoInputs("workflow_dispatch"))).toEqual(FULL_RUN_IN_PARTS);
});

test("a caller with no inputs that runs any mutation job on a push to main fails", () => {
  expect(runsOn(withNoInputs("push"))).toEqual([]);
});

test("a caller that names a mode and runs another run on the event that started it fails", () => {
  const namedModes: readonly [string, string, readonly string[]][] = [
    ["pull_request", "compare", COMPARE],
    ["workflow_dispatch", "baseline", BASELINE],
    ["workflow_dispatch", "refresh", FULL_RUN_IN_PARTS],
    ["push", "baseline", BASELINE],
  ];
  for (const [event, mode, expected] of namedModes) {
    expect(runsOn({ "github.event_name": event, "inputs.mode": mode })).toEqual(expected);
  }
});
