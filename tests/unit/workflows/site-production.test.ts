import { expect, test } from "bun:test";
import { join } from "node:path";
import { workflowSteps } from "../../lib/workflow.ts";

const PRODUCTION = join(import.meta.dir, "../../../.github/workflows/site-production.yml");

type Step = Record<string, unknown>;

const runOf = (step: Step): string => String(step["run"] ?? "");
const usesOf = (step: Step): string => String(step["uses"] ?? "");

function indexWhere(steps: readonly Step[], matches: (step: Step) => boolean): number {
  return steps.findIndex(matches);
}

const steps = workflowSteps(PRODUCTION, "production");
const publish = indexWhere(steps, (step) => usesOf(step).startsWith("avi2d/workflows/actions/pages-publish@"));
const checkout = indexWhere(steps, (step) => runOf(step).startsWith("git checkout --detach"));

test("a production run that publishes without the production gate fails", () => {
  const gate = indexWhere(steps, (step) => runOf(step) === 'bunx checks-production-gate "$SHA"');
  expect(gate).toBeGreaterThanOrEqual(0);
  expect(gate).toBeLessThan(checkout);
  expect(steps.some((step) => runOf(step).includes("checks-release-gate"))).toBe(false);
});

test("a production run that publishes a release commit without its full suite fails", () => {
  const suite = indexWhere(steps, (step) => runOf(step) === "bun run test --full");
  expect(suite).toBeGreaterThan(checkout);
  expect(suite).toBeLessThan(publish);
});

test("a production run that publishes a release commit without its pixel screenshots fails", () => {
  const pixel = indexWhere(steps, (step) => runOf(step) === "bun run test:pixel");
  expect(pixel).toBeGreaterThan(checkout);
  expect(pixel).toBeLessThan(publish);
});
