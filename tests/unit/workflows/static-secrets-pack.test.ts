import { expect, test } from "bun:test";
import { join } from "node:path";
import { conditionRuns, expressionValue } from "../../lib/condition.ts";
import { at, workflowDocument, workflowSteps } from "../../lib/workflow.ts";

const STATIC = join(import.meta.dir, "../../../.github/workflows/static.yml");
const steps = workflowSteps(STATIC, "static");
const pack = steps.findIndex((step) => String(step["uses"] ?? "").startsWith("avi2d/workflows/actions/secrets-pack@"));
const lint = steps.findIndex((step) => step["run"] === "bun run lint");
const declared = at(workflowDocument(STATIC), "on", "workflow_call");

test("a secrets pack written after lint, or one that never reaches lint, fails", () => {
  expect(pack).toBeGreaterThanOrEqual(0);
  expect(pack).toBeLessThan(lint);
  const packValue = String(at(steps[pack], "with", "pack"));
  expect(expressionValue(packValue, { "secrets.CHECKS_SECRETS_PACK": "s3cr3t" })).toBe("s3cr3t");
  expect(expressionValue(packValue, { "secrets.CHECKS_SECRETS_PACK": "other" })).toBe("other");
  expect(at(declared, "secrets", "CHECKS_SECRETS_PACK", "required")).toBe(false);
});

test("a static job that writes the pack for a caller that never asked fails", () => {
  const asked = at(declared, "inputs", "secrets-pack", "default");
  expect(asked).toBe(false);
  expect(conditionRuns(steps[pack]?.["if"], { "inputs.secrets-pack": false })).toBe(false);
  expect(conditionRuns(steps[pack]?.["if"], { "inputs.secrets-pack": true })).toBe(true);
});
