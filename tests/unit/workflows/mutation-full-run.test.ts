import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isRecord } from "../../lib/workflow.ts";

const MUTATION = join(import.meta.dir, "../../../.github/workflows/mutation.yml");
const SKIPS_STATIC_MUTANTS = "refresh";

const workflow: unknown = Bun.YAML.parse(readFileSync(MUTATION, "utf8"));

function jobs(): Record<string, unknown>[] {
  return isRecord(workflow) && isRecord(workflow["jobs"]) ? Object.values(workflow["jobs"]).filter(isRecord) : [];
}

function mutationModes(): unknown[] {
  const steps = jobs().flatMap((job): unknown[] => (Array.isArray(job["steps"]) ? job["steps"] : []));
  const envs = [workflow, ...jobs(), ...steps].filter(isRecord).map((holder) => holder["env"]);
  return envs.filter(isRecord).map((env) => env["CHECKS_MUTATION_MODE"]);
}

test("a shared mutation workflow that a by-hand start runs against this repository fails", () => {
  const on = isRecord(workflow) ? workflow["on"] : undefined;
  expect(isRecord(on) ? Object.keys(on) : []).toEqual(["workflow_call"]);
});

test("a full run that leaves the static mutants untested fails", () => {
  expect(mutationModes()).not.toContain(SKIPS_STATIC_MUTANTS);
});
