import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPOSITORY = join(import.meta.dir, "../../..");
const SHELL_LOGIC = /[;|]|&&|\$\(|\bif\b|\bfor\b|\bwhile\b|\buntil\b/;

// Steps that held shell logic before the rule; the list only shrinks.
const LEGACY = new Set<string>([
  ".github/workflows/ci.yml static lint the workflows",
  ".github/workflows/ci.yml setup a shallow checkout or a commit other than the asked one fails",
  ".github/workflows/ci.yml setup a Bun other than the one .bun-version names fails",
  ".github/workflows/ci.yml setup missing or relocked dependencies fail",
  ".github/workflows/ci.yml gitleaks-cache a gitleaks the next job has to download again fails",
  ".github/workflows/ci.yml docs-only commit a docs change, then a code change",
  ".github/workflows/ci.yml docs-only a code change read as docs-only or a README change read as code fails",
  ".github/workflows/ci.yml playwright a webkit that cannot open a page fails",
  ".github/workflows/ci.yml heavy-slot put a stand-in slot command on the PATH",
  ".github/workflows/ci.yml heavy-slot a slot call on another runner or an unknown action that passes fails",
  ".github/workflows/mutation.yml baseline Score the baseline",
  ".github/workflows/mutation.yml compare Count scoped mutants",
  ".github/workflows/mutation.yml compare Note a scope over the cap",
  ".github/workflows/mutation.yml compare Drop stale tests from the restored state",
  ".github/workflows/mutation.yml compare Compare the head against the baseline",
  ".github/workflows/mutation.yml refresh-plan Split the tree into shards",
  ".github/workflows/mutation.yml refresh-merge Score the refresh",
  "commitlint-status/action.yml runs 0",
  "head-status/action.yml runs 0",
  "heavy-slot/action.yml runs check the inputs",
  "playwright/action.yml runs key",
  "playwright/action.yml runs 2",
  "playwright/action.yml runs 3",
  "setup/action.yml runs require .bun-version",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stepsOf(holder: unknown): readonly unknown[] {
  return isRecord(holder) && Array.isArray(holder["steps"]) ? holder["steps"] : [];
}

function stepGroups(file: string): [string, readonly unknown[]][] {
  const document: unknown = Bun.YAML.parse(readFileSync(join(REPOSITORY, file), "utf8"));
  if (!isRecord(document)) return [];
  if (isRecord(document["jobs"])) return Object.entries(document["jobs"]).map(([job, body]) => [job, stepsOf(body)]);
  return [["runs", stepsOf(document["runs"])]];
}

function stepFiles(): string[] {
  const workflows = readdirSync(join(REPOSITORY, ".github/workflows")).map((name) => `.github/workflows/${name}`);
  const actions = readdirSync(REPOSITORY, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && readdirSync(join(REPOSITORY, entry.name)).includes("action.yml"))
    .map((entry) => `${entry.name}/action.yml`);
  return [...workflows, ...actions].filter((file) => file.endsWith(".yml")).sort();
}

function stepsWithShellLogic(): string[] {
  const found: string[] = [];
  for (const file of stepFiles()) {
    for (const [group, steps] of stepGroups(file)) {
      steps.forEach((step, index) => {
        if (!isRecord(step) || typeof step["run"] !== "string") return;
        const run = step["run"].trim();
        if (!run.includes("\n") && !SHELL_LOGIC.test(run)) return;
        const name = typeof step["name"] === "string" ? step["name"] : typeof step["id"] === "string" ? step["id"] : String(index);
        const key = `${file} ${group} ${name}`;
        if (!LEGACY.has(key)) found.push(key);
      });
    }
  }
  return found;
}

test("a run step that holds shell logic in place of one plain command fails", () => {
  expect(stepsWithShellLogic()).toEqual([]);
});
