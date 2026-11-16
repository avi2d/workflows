import { expect, test } from "bun:test";
import { join } from "node:path";
import { conditionRuns, expressionValue, type Status } from "../../lib/condition.ts";
import { at, workflowDocument, workflowSteps } from "../../lib/workflow.ts";

const FLAKE = join(import.meta.dir, "../../../.github/workflows/flake.yml");
const document = workflowDocument(FLAKE);
const steps = workflowSteps(FLAKE, "flake");

const GREEN: Status = { always: true, cancelled: false, success: true, failure: false };
const RED: Status = { always: true, cancelled: false, success: false, failure: true };

const usesOf = (step: Record<string, unknown> | undefined): string => String(step?.["uses"] ?? "");
const sweep = steps.findIndex((step) => String(step["run"] ?? "").startsWith("bunx checks-flake "));

test("a flake run that cannot start from a caller passing no inputs fails", () => {
  const inputs = at(document, "on", "workflow_call", "inputs");
  for (const input of Object.values(typeof inputs === "object" && inputs !== null ? inputs : {})) {
    expect(at(input, "required")).not.toBe(true);
  }
  expect(at(document, "jobs", "flake", "permissions")).toEqual({ contents: "read" });
});

test("a flake run that sweeps other than ten runs into flake-report.json by default fails", () => {
  expect(at(document, "on", "workflow_call", "inputs", "runs", "default")).toBe("10");
  const runs = String(at(steps[sweep], "env", "RUNS"));
  expect(expressionValue(runs, { "inputs.runs": "7" })).toBe("7");
  expect(expressionValue(runs, { "inputs.runs": "10" })).toBe("10");
  const parts = String(steps[sweep]?.["run"] ?? "").split(" ");
  expect(parts[0]).toBe("bunx");
  expect(parts[1]).toBe("checks-flake");
  expect(parts).toContain("--runs");
  expect(parts).toContain('"$RUNS"');
  expect(parts).toContain("--report");
  expect(parts).toContain("flake-report.json");
});

test("a flake report left unsaved on a green or a red sweep fails", () => {
  const upload = steps.find((step) => usesOf(step).startsWith("actions/upload-artifact@") && at(step, "with", "path") === "flake-report.json");
  expect(conditionRuns(upload?.["if"], {}, GREEN)).toBe(true);
  expect(conditionRuns(upload?.["if"], {}, RED)).toBe(true);
});

test("a heavy slot taken after the sweep, or kept after a red one, fails", () => {
  const slots = steps.flatMap((step, index) => (usesOf(step).startsWith("avi2d/workflows/actions/heavy-slot@") ? [index] : []));
  const [acquire = -1, release = -1] = slots;
  expect(at(steps[acquire], "with", "action")).toBe("acquire");
  expect(acquire).toBeLessThan(sweep);
  expect(at(steps[release], "with", "action")).toBe("release");
  expect(release).toBeGreaterThan(sweep);
  expect(conditionRuns(steps[release]?.["if"], {}, RED)).toBe(true);
});
