import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isRecord } from "../../../lib/workflow.ts";

function steps(): readonly Record<string, unknown>[] {
  const action: unknown = Bun.YAML.parse(readFileSync(join(import.meta.dir, "../../../../actions/playwright/action.yml"), "utf8"));
  const runs = isRecord(action) ? action["runs"] : undefined;
  if (!isRecord(runs) || !Array.isArray(runs["steps"])) throw new Error("Missing action steps");
  return runs["steps"].filter(isRecord);
}

function enabled(condition: unknown, context: Record<string, string>): boolean {
  if (condition === undefined) return true;
  if (typeof condition !== "string") throw new Error("Invalid condition");
  return condition.split("&&").every((clause) => {
    const match = /^\s*(inputs\.cache|runner\.environment)\s*==\s*'([^']*)'\s*$/.exec(clause);
    if (!match) throw new Error(`Unsupported condition: ${clause}`);
    return context[match[1] ?? ""] === match[2];
  });
}

test("self-hosted runners never transfer the browser cache and all runners still install browsers", () => {
  const actionSteps = steps();
  const caches = actionSteps.filter((step) => typeof step["uses"] === "string" && step["uses"].startsWith("actions/cache@"));
  const install = actionSteps.filter((step) => step["name"] === "install the browsers");
  expect(caches).toHaveLength(1);
  expect(install).toHaveLength(1);
  for (const environment of ["github-hosted", "self-hosted"]) {
    for (const cache of ["true", "false"]) {
      const context = { "runner.environment": environment, "inputs.cache": cache };
      expect(enabled(caches[0]?.["if"], context)).toBe(environment === "github-hosted" && cache === "true");
      expect(enabled(install[0]?.["if"], context)).toBe(true);
    }
  }
});
