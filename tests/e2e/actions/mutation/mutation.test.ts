import { afterEach, beforeEach, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPOSITORY = join(import.meta.dir, "../../../..");
const SCRIPT = join(REPOSITORY, "actions/mutation/main.ts");
const CLAMP = join(REPOSITORY, "tests/fixtures/mutation-count/clamp.ts");

let root = "";

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "mutation-part-"));
  mkdirSync(join(root, "workspace", "src"), { recursive: true });
  mkdirSync(join(root, "temp"));
  writeFileSync(join(root, "github-env"), "");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function part(env: Readonly<Record<string, string>>): { readonly exitCode: number; readonly githubEnv: string } {
  const result = Bun.spawnSync(["bun", SCRIPT], {
    cwd: join(root, "workspace"),
    env: { PATH: process.env["PATH"] ?? "", HOME: root, RUNNER_TEMP: join(root, "temp"), GITHUB_ENV: join(root, "github-env"), ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  return { exitCode: result.exitCode, githubEnv: readFileSync(join(root, "github-env"), "utf8") };
}

function headReport(files: Readonly<Record<string, readonly string[]>>): void {
  mkdirSync(join(root, "workspace", "reports", "mutation"), { recursive: true });
  const report = { files: Object.fromEntries(Object.entries(files).map(([file, statuses]) => [file, { mutants: statuses.map((status) => ({ status })) }])) };
  writeFileSync(join(root, "workspace", "reports", "mutation", "mutation.json"), JSON.stringify(report));
}

test("a scope count other than the 14 mutants Stryker finds in the changed file fails", () => {
  cpSync(CLAMP, join(root, "workspace", "src", "clamp.ts"));
  expect(part({ PART: "count-scope", SCOPE: "src/clamp.ts", MUTANT_CAP: "14" })).toEqual({ exitCode: 0, githubEnv: "SCOPED_MUTANTS=14\n" });
});

test("a scope one mutant over the cap that runs anyway fails", () => {
  cpSync(CLAMP, join(root, "workspace", "src", "clamp.ts"));
  expect(part({ PART: "count-scope", SCOPE: "src/clamp.ts", MUTANT_CAP: "13" }).githubEnv).toBe("SCOPED_MUTANTS=14\nOVER_CAP=true\n");
});

test("a scope count that reads an escaped glob as the file name fails", () => {
  cpSync(CLAMP, join(root, "workspace", "src", "[id].ts"));
  expect(part({ PART: "count-scope", SCOPE: "src/[[]id[]].ts", MUTANT_CAP: "1500" }).githubEnv).toBe("SCOPED_MUTANTS=14\n");
});

test("a scope count that fails on a renamed file's old path, which the head no longer holds, fails", () => {
  cpSync(CLAMP, join(root, "workspace", "src", "clamp.ts"));
  expect(part({ PART: "count-scope", SCOPE: "src/old-clamp.ts,src/clamp.ts", MUTANT_CAP: "1500" })).toEqual({ exitCode: 0, githubEnv: "SCOPED_MUTANTS=14\n" });
});

test("a comment that scores files outside the scope, or none at all, fails", () => {
  headReport({ "src/a.ts": ["Killed", "Survived"], "src/other.ts": ["Survived", "Survived"] });
  const run = part({ PART: "scope-score", SCOPE: "src/a.ts" });
  expect(run).toEqual({ exitCode: 0, githubEnv: "COMMENT=true\n" });
  expect(readFileSync(join(root, "temp", "comment.md"), "utf8")).toBe(
    "## mutation score\n\nThe changed files: Detected 1 of 2 mutants (50%).\n\n- `src/a.ts`: Detected 1 of 2 mutants (50%).\n",
  );
});

test("a scored run whose head wrote no report that passes fails", () => {
  expect(part({ PART: "scope-score", SCOPE: "src/a.ts" }).exitCode).not.toBe(0);
});

test.each(["compare", "drop-stale-tests"])("the %s part, which reads state from main, still running fails", (removed) => {
  headReport({ "src/a.ts": ["Killed"] });
  expect(part({ PART: removed, SCOPE: "src/a.ts", STALE_TESTS: "tests/a.test.ts" }).exitCode).not.toBe(0);
});
