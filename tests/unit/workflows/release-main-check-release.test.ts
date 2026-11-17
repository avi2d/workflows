import { expect, test } from "bun:test";
import { join } from "node:path";
import { conditionRuns } from "../../lib/condition.ts";
import { at, needsOf, workflowDocument, workflowSteps, isRecord } from "../../lib/workflow.ts";

const path = join(import.meta.dir, "../../../.github/workflows/release-main.yml");
const document = workflowDocument(path);
const steps = workflowSteps(path, "static");

test("release static checks do not run when check-release is absent or false", () => {
  expect(at(document, "on", "workflow_call", "inputs", "check-release", "type")).toBe("boolean");
  expect(at(document, "on", "workflow_call", "inputs", "check-release", "default")).toBe(false);
  expect(conditionRuns(at(document, "jobs", "static", "if"), { "inputs.check-release": false })).toBe(false);
});

test("check-release cannot publish without running lint and typecheck", () => {
  expect(conditionRuns(at(document, "jobs", "static", "if"), { "inputs.check-release": true })).toBe(true);
  expect(steps.map((step) => step["run"]).filter(Boolean)).toEqual(["bun run lint", "bun run build", "git diff --exit-code", "bun run typecheck"]);
  expect(at(document, "jobs", "static", "permissions")).toEqual({ contents: "read" });
  const release = at(document, "jobs", "release");
  expect(isRecord(release) && needsOf(release)).toContain("static");
});

test("a failed or cancelled static check cannot publish", () => {
  const condition = at(document, "jobs", "release", "if");
  for (const suite of ["success", "skipped"]) {
    for (const staticResult of ["success", "skipped", "failure", "cancelled"]) {
      const actual = conditionRuns(condition, { "needs.suite.result": suite, "needs.static.result": staticResult });
      expect(actual).toBe(staticResult === "success" || staticResult === "skipped");
    }
  }
});
