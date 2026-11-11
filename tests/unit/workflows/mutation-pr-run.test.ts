import { expect, test } from "bun:test";
import { join } from "node:path";
import { isRecord, workflowSteps } from "../../lib/workflow.ts";

const WORKFLOW = join(import.meta.dir, "../../../.github/workflows/mutation.yml");

function stepsOf(job: string): readonly Record<string, unknown>[] {
  return workflowSteps(WORKFLOW, job);
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
    for (const step of stepsOf(job)) {
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
  const actual = stepsOf("compare").map((step) => ({ uses: usesBase(step["uses"]), part: stepPart(step), run: stepRun(step) }));
  expect(actual).toEqual([
    { uses: "avi2d/workflows/setup", part: null, run: null },
    { uses: "avi2d/workflows/kit-bin", part: null, run: null },
    { uses: "avi2d/workflows/actions/mutation-scope", part: null, run: null },
    { uses: "avi2d/workflows/actions/mutation", part: "count-scope", run: null },
    { uses: "avi2d/workflows/actions/mutation", part: "over-cap", run: null },
    { uses: null, part: null, run: 'bunx stryker run --mutate "$SCOPE"' },
    { uses: "avi2d/workflows/actions/mutation", part: "scope-score", run: null },
    { uses: null, part: null, run: 'gh pr comment "$PR_NUMBER" --body-file "$RUNNER_TEMP/comment.md"' },
    { uses: "avi2d/workflows/actions/mutation", part: "fork-summary", run: null },
  ]);
});

function conditionRuns(condition: unknown, env: Readonly<Record<string, string>>): boolean {
  if (typeof condition !== "string" || condition.trim() === "") return true;
  const source = condition;
  let pos = 0;
  const skipSpaces = (): void => {
    while (pos < source.length && /\s/.test(source[pos] ?? "")) pos += 1;
  };
  const toBoolean = (value: string | boolean): boolean => (typeof value === "boolean" ? value : value !== "");
  const toText = (value: string | boolean): string => (typeof value === "boolean" ? String(value) : value);
  function parseOperand(): string | boolean {
    skipSpaces();
    if (source.startsWith("env.", pos)) {
      pos += "env.".length;
      let name = "";
      while (pos < source.length && /[A-Za-z0-9_]/.test(source[pos] ?? "")) name += source[pos++] ?? "";
      return env[name] ?? "";
    }
    const quote = source[pos];
    if (quote === "'" || quote === '"') {
      pos += 1;
      let literal = "";
      while (pos < source.length && source[pos] !== quote) literal += source[pos++] ?? "";
      pos += 1;
      return literal;
    }
    let name = "";
    while (pos < source.length && /[A-Za-z0-9_.]/.test(source[pos] ?? "")) name += source[pos++] ?? "";
    skipSpaces();
    if (source[pos] === "(") {
      pos += 1;
      skipSpaces();
      if (source[pos] !== ")") throw new Error(`cannot read ${condition}`);
      pos += 1;
      if (name === "always" || name === "success") return true;
      if (name === "cancelled" || name === "failure") return false;
      return true;
    }
    if (name === "true") return true;
    if (name === "false") return false;
    throw new Error(`cannot read ${condition}`);
  }
  function parseComparison(): string | boolean {
    const left = parseOperand();
    skipSpaces();
    if (source.startsWith("==", pos) || source.startsWith("!=", pos)) {
      const equal = source.startsWith("==", pos);
      pos += 2;
      const right = parseOperand();
      return equal ? toText(left) === toText(right) : toText(left) !== toText(right);
    }
    return left;
  }
  function parseNot(): boolean {
    skipSpaces();
    if (source[pos] === "!") {
      pos += 1;
      return !parseNot();
    }
    if (source[pos] === "(") {
      pos += 1;
      const inner = parseOr();
      skipSpaces();
      if (source[pos] !== ")") throw new Error(`cannot read ${condition}`);
      pos += 1;
      return inner;
    }
    return toBoolean(parseComparison());
  }
  function parseAnd(): boolean {
    let left = parseNot();
    for (;;) {
      skipSpaces();
      if (!source.startsWith("&&", pos)) return left;
      pos += 2;
      left = parseNot() && left;
    }
  }
  function parseOr(): boolean {
    let left = parseAnd();
    for (;;) {
      skipSpaces();
      if (!source.startsWith("||", pos)) return left;
      pos += 2;
      left = parseAnd() || left;
    }
  }
  const result = parseOr();
  skipSpaces();
  if (pos !== source.length) throw new Error(`cannot read ${condition}`);
  return result;
}

test("a skipped pull request that still counts, runs or scores its mutants fails", () => {
  const gated = new Set(["Count scoped mutants", "Run the scoped head", "Score the changed files"]);
  const steps = stepsOf("compare").filter((step) => gated.has(String(step["name"])));
  expect(steps.length).toBe(3);
  for (const step of steps) {
    for (const skip of ["release", "bot", "no-source"]) {
      for (const scope of ["", "src/a.ts"]) {
        for (const overCap of ["", "true"]) {
          expect(conditionRuns(step["if"], { SKIP: skip, SCOPE: scope, OVER_CAP: overCap })).toBe(false);
        }
      }
    }
    expect(conditionRuns(step["if"], { SKIP: "", SCOPE: "src/a.ts", OVER_CAP: "" })).toBe(true);
  }
});

test("a mutation action pinned at commits that disagree, or running a part the workflow names that is unknown, fails", () => {
  const { pins, parts } = mutationPinsAndParts();
  expect(pins.length).toBeGreaterThan(0);
  expect(new Set(pins).size).toBe(1);
  expect(parts).toEqual(["count-scope", "fork-summary", "over-cap", "scope-score", "score", "shards"]);
});

