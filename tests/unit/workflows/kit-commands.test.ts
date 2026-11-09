import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const WORKFLOWS = join(import.meta.dir, "../../../.github/workflows");
const EXECS_KIT_INSTALL = /exec "?\.\/node_modules\/\.bin\//;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stepsOf(job: unknown): readonly unknown[] {
  return isRecord(job) && Array.isArray(job["steps"]) ? job["steps"] : [];
}

function inlineKitResolvers(): string[] {
  const found: string[] = [];
  for (const file of readdirSync(WORKFLOWS).filter((name) => name.endsWith(".yml"))) {
    const document: unknown = Bun.YAML.parse(readFileSync(join(WORKFLOWS, file), "utf8"));
    const jobs = isRecord(document) && isRecord(document["jobs"]) ? document["jobs"] : {};
    for (const [name, job] of Object.entries(jobs)) {
      for (const step of stepsOf(job)) {
        if (isRecord(step) && EXECS_KIT_INSTALL.test(String(step["run"] ?? ""))) found.push(`${file} ${name}`);
      }
    }
  }
  return found;
}

test("a workflow that resolves kit commands inline in place of kit-bin fails", () => {
  expect(inlineKitResolvers()).toEqual([]);
});
