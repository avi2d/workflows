import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPOSITORY = join(import.meta.dir, "../../..");
const MUTATION_ACTION = /^avi2d\/workflows\/actions\/mutation@([0-9a-f]{40})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function jobSteps(job: string): readonly Record<string, unknown>[] {
  const document: unknown = Bun.YAML.parse(readFileSync(join(REPOSITORY, ".github/workflows/mutation.yml"), "utf8"));
  const jobs = isRecord(document) ? document["jobs"] : undefined;
  const body = isRecord(jobs) ? jobs[job] : undefined;
  const steps: unknown[] = isRecord(body) && Array.isArray(body["steps"]) ? body["steps"] : [];
  return steps.filter(isRecord);
}

const textOf = (step: Record<string, unknown>): string => JSON.stringify(step);

test("a pull request run that restores, reuses or compares against a result from main fails", () => {
  const reachesMain = jobSteps("compare")
    .map(textOf)
    .filter((step) => /checks-mutation-baseline|checks-mutation-compare|--incremental|"part":"(compare|drop-stale-tests)"/.test(step));
  expect(reachesMain).toEqual([]);
});

test("a pull request run that never files the changed files' score fails", () => {
  expect(jobSteps("compare").some((step) => isRecord(step["with"]) && step["with"]["part"] === "scope-score")).toBe(true);
});

test("a mutation action pinned at a commit that lacks a part the workflow runs fails", () => {
  const missing = ["baseline", "compare", "refresh-plan", "refresh-merge"].flatMap((job) =>
    jobSteps(job).flatMap((step) => {
      const pin = MUTATION_ACTION.exec(String(step["uses"] ?? ""))?.[1];
      const part = isRecord(step["with"]) ? String(step["with"]["part"]) : "";
      if (pin === undefined) return [];
      const key = `^\\s+("${part}":|${part},$)`;
      const found = Bun.spawnSync(["git", "grep", "-q", "-E", key, pin, "--", ":(glob)**/mutation/mutation.ts"], { cwd: REPOSITORY });
      return found.exitCode === 0 ? [] : [`${job} ${part} @${pin}`];
    }),
  );
  expect(missing).toEqual([]);
});
