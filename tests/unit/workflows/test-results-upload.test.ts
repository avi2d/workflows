import { expect, test } from "bun:test";
import { join } from "node:path";
import { conditionRuns, type Status } from "../../lib/condition.ts";
import { workflowSteps } from "../../lib/workflow.ts";

const WORKFLOWS = join(import.meta.dir, "../../../.github/workflows");

const GREEN: Status = { always: true, cancelled: false, success: true, failure: false };
const RED: Status = { always: true, cancelled: false, success: false, failure: true };

const UPLOADERS: readonly [string, string][] = [
  ["test.yml", "test"],
  ["site-ci.yml", "checks"],
];

function resultsUpload(file: string, job: string): Record<string, unknown> {
  const upload = workflowSteps(join(WORKFLOWS, file), job).find((step) => {
    const inputs = step["with"];
    return String(step["uses"] ?? "").startsWith("actions/upload-artifact@") && typeof inputs === "object" && inputs !== null && "path" in inputs && inputs.path === "artifacts/";
  });
  if (upload === undefined) throw new Error(`${file} uploads no artifacts/ folder`);
  return upload;
}

test("a test results upload that skips a green run or a red one fails", () => {
  for (const [file, job] of UPLOADERS) {
    const condition = resultsUpload(file, job)["if"];
    expect([file, conditionRuns(condition, {}, GREEN)]).toEqual([file, true]);
    expect([file, conditionRuns(condition, {}, RED)]).toEqual([file, true]);
  }
});
