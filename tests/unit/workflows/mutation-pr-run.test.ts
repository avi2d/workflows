import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPOSITORY = join(import.meta.dir, "../../..");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function workflowSteps(job: string): readonly Record<string, unknown>[] {
  const document: unknown = Bun.YAML.parse(readFileSync(join(REPOSITORY, ".github/workflows/mutation.yml"), "utf8"));
  const jobs = isRecord(document) ? document["jobs"] : undefined;
  const body = isRecord(jobs) ? jobs[job] : undefined;
  const steps: unknown[] = isRecord(body) && Array.isArray(body["steps"]) ? body["steps"] : [];
  return steps.filter(isRecord);
}

function usesBase(uses: unknown): string | null {
  if (typeof uses !== "string") return null;
  const at = uses.indexOf("@");
  return at === -1 ? uses : uses.slice(0, at);
}

function stepPart(step: Record<string, unknown>): string | null {
  if (!isRecord(step["with"])) return null;
  const part = step["with"]["part"];
  return typeof part === "string" ? part : null;
}

function stepRun(step: Record<string, unknown>): string | null {
  return typeof step["run"] === "string" ? step["run"] : null;
}

test("a pull request run that restores, reuses or compares against a result from main fails", () => {
  const actual = workflowSteps("compare").map((step) => ({ uses: usesBase(step["uses"]), part: stepPart(step), run: stepRun(step) }));
  expect(actual).toEqual([
    { uses: "avi2d/workflows/setup", part: null, run: null },
    { uses: "avi2d/workflows/kit-bin", part: null, run: null },
    { uses: "avi2d/workflows/actions/mutation-scope", part: null, run: null },
    { uses: null, part: null, run: 'echo "::notice::mutation: no source files changed, so the run does not start"' },
    { uses: "avi2d/workflows/actions/mutation", part: "count-scope", run: null },
    { uses: "avi2d/workflows/actions/mutation", part: "over-cap", run: null },
    { uses: null, part: null, run: 'bunx stryker run --mutate "$SCOPE"' },
    { uses: "avi2d/workflows/actions/mutation", part: "scope-score", run: null },
    { uses: null, part: null, run: 'gh pr comment "$PR_NUMBER" --body-file "$RUNNER_TEMP/comment.md"' },
    { uses: "avi2d/workflows/actions/mutation", part: "fork-summary", run: null },
  ]);
});

test("a pull request run that never files the changed files score fails", () => {
  expect(workflowSteps("compare").some((step) => isRecord(step["with"]) && step["with"]["part"] === "scope-score")).toBe(true);
});

test("a mutation action pinned at a commit that lacks a part the workflow runs fails", () => {
  const jobs = ["baseline", "compare", "refresh-plan", "refresh-merge"];
  const pins: string[] = [];
  const parts = new Set<string>();
  for (const job of jobs) {
    for (const step of workflowSteps(job)) {
      const uses = typeof step["uses"] === "string" ? step["uses"] : "";
      const prefix = "avi2d/workflows/actions/mutation@";
      if (!uses.startsWith(prefix)) continue;
      pins.push(uses.slice(prefix.length));
      const part = stepPart(step);
      if (part !== null) parts.add(part);
    }
  }
  expect(pins.length).toBeGreaterThan(0);
  expect(new Set(pins).size).toBe(1);
  expect([...parts].toSorted()).toEqual(["count-scope", "fork-summary", "over-cap", "scope-score", "score", "shards"]);
  for (const part of parts) {
    const result = Bun.spawnSync(["bun", join(REPOSITORY, "actions/mutation/main.ts")], {
      env: { ...process.env, PART: part, MODE: "baseline", SCOPE: "src/a.ts", MUTANT_CAP: "1500", SHARDS: "4" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = `${result.stdout?.toString() ?? ""}${result.stderr?.toString() ?? ""}`;
    expect(output).not.toContain("part must be one of");
  }
});
