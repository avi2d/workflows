import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ACTION = join(import.meta.dir, "../../../../actions/mutation/action.yml");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

test("a shard list left on the inner step, where the caller's step cannot read it, fails", () => {
  const action: unknown = Bun.YAML.parse(readFileSync(ACTION, "utf8"));
  const runs = isRecord(action) ? action["runs"] : undefined;
  const steps: unknown[] = isRecord(runs) && Array.isArray(runs["steps"]) ? runs["steps"] : [];
  const part = steps.find((step) => isRecord(step) && String(step["run"] ?? "").includes("main.ts"));
  const outputs = isRecord(action) ? action["outputs"] : undefined;
  const shards = isRecord(outputs) ? outputs["shards"] : undefined;
  expect(isRecord(part) && typeof part["id"] === "string").toBe(true);
  expect(isRecord(shards) ? shards["value"] : undefined).toBe(`\${{ steps.${isRecord(part) ? String(part["id"]) : ""}.outputs.shards }}`);
});
