import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ACTIONS = join(import.meta.dir, "../../../actions");
const STEP_OUTPUT = /^\$\{\{ steps\.([A-Za-z0-9_-]+)\.outputs\.([A-Za-z0-9_-]+) \}\}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function unwiredOutputs(): string[] {
  const unwired: string[] = [];
  for (const name of new Bun.Glob("**/action.yml").scanSync(ACTIONS)) {
    const action: unknown = Bun.YAML.parse(readFileSync(join(ACTIONS, name), "utf8"));
    const runs = isRecord(action) ? action["runs"] : undefined;
    const steps: unknown[] = isRecord(runs) && Array.isArray(runs["steps"]) ? runs["steps"] : [];
    const ids = new Set(steps.flatMap((step) => (isRecord(step) && typeof step["id"] === "string" ? [step["id"]] : [])));
    const outputs = isRecord(action) && isRecord(action["outputs"]) ? action["outputs"] : {};
    for (const [output, declared] of Object.entries(outputs)) {
      const match = STEP_OUTPUT.exec(isRecord(declared) ? String(declared["value"]) : "");
      if (match === null || !ids.has(match[1] ?? "") || match[2] !== output) unwired.push(`${name} ${output}`);
    }
  }
  return unwired;
}

test("an action output that reads a step the action lacks, or another output name, fails", () => {
  expect(unwiredOutputs()).toEqual([]);
});
