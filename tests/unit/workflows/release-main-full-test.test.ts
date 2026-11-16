import { expect, test } from "bun:test";
import { join } from "node:path";
import { conditionRuns } from "../../lib/condition.ts";
import { at, workflowDocument, workflowSteps } from "../../lib/workflow.ts";

const RELEASE_MAIN = join(import.meta.dir, "../../../.github/workflows/release-main.yml");
const steps = workflowSteps(RELEASE_MAIN, "release");
const suite = steps.findIndex((step) => step["run"] === "bun run test --full");
const tag = steps.findIndex((step) => step["run"] === "bunx checks-release-tag");

function suiteRuns(fullTest: boolean, message: string): boolean {
  return conditionRuns(steps[suite]?.["if"], { "inputs.full-test": fullTest, "github.event.head_commit.message": message });
}

test("a full suite that runs after the tag and the publish fails", () => {
  expect(suite).toBeGreaterThanOrEqual(0);
  expect(suite).toBeLessThan(tag);
});

test("a caller that never asked for the full suite and gets it fails", () => {
  expect(at(workflowDocument(RELEASE_MAIN), "on", "workflow_call", "inputs", "full-test", "default")).toBe(false);
  expect(suiteRuns(false, "chore: release 1.2.3 (#40)")).toBe(false);
});

test("a release commit that publishes without the suite it asked for, or a plain merge that runs it, fails", () => {
  expect(suiteRuns(true, "chore: release 1.2.3 (#40)")).toBe(true);
  expect(suiteRuns(true, "fix: keep the cache (#41)")).toBe(false);
});
