import { expect, test } from "bun:test";
import { join } from "node:path";
import { conditionRuns, expressionValue } from "../../lib/condition.ts";
import { at, needsOf, workflowDocument, workflowSteps, isRecord } from "../../lib/workflow.ts";

const path = join(import.meta.dir, "../../../.github/workflows/release-main.yml");
const document = workflowDocument(path);
const steps = workflowSteps(path, "static");
const staticPath = join(import.meta.dir, "../../../.github/workflows/static.yml");
const staticDocument = workflowDocument(staticPath);
const staticSteps = workflowSteps(staticPath, "static");

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

test("a release secrets pack written after lint, or one that never reaches lint, fails", () => {
  const pack = steps.findIndex((step) => String(step["uses"] ?? "").startsWith("avi2d/workflows/actions/secrets-pack@"));
  const lint = steps.findIndex((step) => step["run"] === "bun run lint");
  const oracle = staticSteps.find((step) => String(step["uses"] ?? "").startsWith("avi2d/workflows/actions/secrets-pack@"));
  expect(pack).toBeGreaterThanOrEqual(0);
  expect(pack).toBeLessThan(lint);
  expect(String(at(steps[pack], "with", "pack"))).toBe(String(at(oracle, "with", "pack")));
  expect(expressionValue(at(steps[pack], "with", "pack"), { "secrets.CHECKS_SECRETS_PACK": "s3cr3t" })).toBe("s3cr3t");
  expect(expressionValue(at(steps[pack], "with", "pack"), { "secrets.CHECKS_SECRETS_PACK": "other" })).toBe("other");
  expect(at(document, "on", "workflow_call", "secrets", "CHECKS_SECRETS_PACK", "required")).toBe(at(staticDocument, "on", "workflow_call", "secrets", "CHECKS_SECRETS_PACK", "required"));
});

test("a release job that writes the pack for a caller that never asked fails", () => {
  expect(at(document, "on", "workflow_call", "inputs", "secrets-pack", "default")).toBe(at(staticDocument, "on", "workflow_call", "inputs", "secrets-pack", "default"));
  const pack = steps.find((step) => String(step["uses"] ?? "").startsWith("avi2d/workflows/actions/secrets-pack@"));
  expect(conditionRuns(pack?.["if"], { "inputs.secrets-pack": false })).toBe(false);
  expect(conditionRuns(pack?.["if"], { "inputs.secrets-pack": true })).toBe(true);
});
