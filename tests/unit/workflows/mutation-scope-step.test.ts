import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MUTATION = join(import.meta.dir, "../../../.github/workflows/mutation.yml");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function compareScopeStep(): Record<string, unknown> {
  const document: unknown = Bun.YAML.parse(readFileSync(MUTATION, "utf8"));
  const jobs = isRecord(document) ? document["jobs"] : undefined;
  const compare = isRecord(jobs) ? jobs["compare"] : undefined;
  const steps: unknown[] = isRecord(compare) && Array.isArray(compare["steps"]) ? compare["steps"] : [];
  const step = steps.find((candidate) => isRecord(candidate) && String(candidate["uses"] ?? "").startsWith("avi2d/workflows/actions/mutation-scope@"));
  if (!isRecord(step)) throw new Error("mutation.yml compare calls no mutation-scope action");
  return step;
}

test("a compare scope that ignores the pull request's base branch fails", () => {
  const step = compareScopeStep();
  expect(step["with"]).toEqual({ "base-ref": "${{ github.event.pull_request.base.ref }}" });
});

test("a compare scope pinned to anything but a full commit SHA fails", () => {
  expect(String(compareScopeStep()["uses"])).toMatch(/@[0-9a-f]{40}$/);
});
