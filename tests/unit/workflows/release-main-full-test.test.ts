import { expect, test } from "bun:test";
import { join } from "node:path";
import { conditionRuns, type Status } from "../../lib/condition.ts";
import { at, workflowDocument, workflowSteps } from "../../lib/workflow.ts";

const RELEASE_MAIN = join(import.meta.dir, "../../../.github/workflows/release-main.yml");
const document = workflowDocument(RELEASE_MAIN);
const suiteSteps = workflowSteps(RELEASE_MAIN, "suite");
const releaseSteps = workflowSteps(RELEASE_MAIN, "release");
const suite = suiteSteps.findIndex((step) => step["run"] === "bun run test --full");

const CANCELLED: Status = { always: true, cancelled: true, success: false, failure: false };

function suiteRuns(fullTest: boolean, message: string): boolean {
  return conditionRuns(suiteSteps[suite]?.["if"], { "inputs.full-test": fullTest, "github.event.head_commit.message": message });
}

function releaseRuns(result: string, status?: Status): boolean {
  return status === undefined
    ? conditionRuns(at(document, "jobs", "release", "if"), { "needs.suite.result": result })
    : conditionRuns(at(document, "jobs", "release", "if"), { "needs.suite.result": result }, status);
}

test("a full suite that runs with publish rights fails", () => {
  expect(suite).toBeGreaterThanOrEqual(0);
  expect(releaseSteps.some((step) => step["run"] === "bun run test --full")).toBe(false);
  expect(at(document, "jobs", "suite", "permissions")).toEqual({ contents: "read" });
  expect(at(document, "jobs", "release", "permissions")).toEqual({ contents: "write", "id-token": "write", actions: "read", "pull-requests": "read" });
  expect(at(suiteSteps[0], "with", "persist-credentials")).toBe("false");
});

test("a caller that never asked for the full suite and gets it fails", () => {
  expect(at(document, "on", "workflow_call", "inputs", "full-test", "default")).toBe(false);
  expect(suiteRuns(false, "chore: release 1.2.3 (#40)")).toBe(false);
});

test("a release commit that publishes without the suite it asked for, or a plain merge that runs it, fails", () => {
  expect(suiteRuns(true, "chore: release 1.2.3 (#40)")).toBe(true);
  expect(suiteRuns(true, "fix: keep the cache (#41)")).toBe(false);
});

test("a release that publishes without waiting for the suite fails", () => {
  expect(at(document, "jobs", "release", "needs")).toContain("suite");
  expect(releaseRuns("success")).toBe(true);
  expect(releaseRuns("skipped")).toBe(true);
  expect(releaseRuns("failure")).toBe(false);
  expect(releaseRuns("success", CANCELLED)).toBe(false);
});
