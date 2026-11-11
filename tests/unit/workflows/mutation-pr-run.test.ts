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

function mutationPinsAndParts(): { readonly pins: readonly string[]; readonly parts: readonly string[] } {
  const jobs = ["baseline", "compare", "refresh-plan", "refresh-merge"];
  const pins: string[] = [];
  const partSet = new Set<string>();
  for (const job of jobs) {
    for (const step of workflowSteps(job)) {
      const uses = typeof step["uses"] === "string" ? step["uses"] : "";
      const mutationPrefix = "avi2d/workflows/actions/mutation@";
      const scopePrefix = "avi2d/workflows/actions/mutation-scope@";
      if (uses.startsWith(mutationPrefix)) {
        pins.push(uses.slice(mutationPrefix.length));
        const part = stepPart(step);
        if (part !== null) partSet.add(part);
      } else if (uses.startsWith(scopePrefix)) {
        pins.push(uses.slice(scopePrefix.length));
      }
    }
  }
  return { pins, parts: [...partSet].toSorted() };
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

test("a mutation action pinned at commits that disagree, or running a part the workflow names that is unknown, fails", () => {
  const { pins, parts } = mutationPinsAndParts();
  expect(pins.length).toBeGreaterThan(0);
  expect(new Set(pins).size).toBe(1);
  expect(parts).toEqual(["count-scope", "fork-summary", "over-cap", "scope-score", "score", "shards"]);
});

