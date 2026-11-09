import { afterAll, beforeAll, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPOSITORY = join(import.meta.dir, "../../..");
const HISTORY = join(REPOSITORY, "tests/fixtures/mutation-scope/history.bundle");
const SCRIPT = join(REPOSITORY, "mutation-scope/mutation-scope.ts");

let root = "";

function git(args: readonly string[]): string {
  const result = Bun.spawnSync(["git", ...args], { cwd: join(root, "head"), stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr.toString()}`);
  return result.stdout.toString().trim();
}

function standIn(name: string, body: string): void {
  writeFileSync(join(root, "bin", name), `#!/bin/sh\n${body}\n`);
  chmodSync(join(root, "bin", name), 0o755);
}

function scopeRun(baseRef: string, failBaseline = false): { readonly exitCode: number; readonly githubEnv: string; readonly calls: string } {
  const githubEnv = join(root, "github-env");
  const calls = join(root, "calls");
  writeFileSync(githubEnv, "");
  writeFileSync(calls, "");
  const result = Bun.spawnSync(["bun", SCRIPT], {
    cwd: join(root, "head"),
    env: {
      PATH: `${join(root, "bin")}:${process.env["PATH"] ?? ""}`,
      HOME: root,
      RUNNER_TEMP: root,
      GITHUB_ENV: githubEnv,
      BASE_REF: baseRef,
      FAIL_BASELINE: failBaseline ? "1" : "",
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  return { exitCode: result.exitCode, githubEnv: readFileSync(githubEnv, "utf8"), calls: readFileSync(calls, "utf8") };
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "mutation-scope-"));
  Bun.spawnSync(["git", "clone", "--quiet", "--branch", "pr-head", HISTORY, "head"], { cwd: root });
  mkdirSync(join(root, "bin"));
  standIn("checks-mutation-baseline", 'echo "baseline $*" >> "$RUNNER_TEMP/calls"; [ -z "$FAIL_BASELINE" ]');
  standIn("checks-mutation-scope", 'echo "scope $*" >> "$RUNNER_TEMP/calls"; echo "SCOPE=$1"');
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

test("a pull request into release scoped from where it left main in place of its own base fails", () => {
  expect(scopeRun("release").githubEnv).toBe(`SCOPE=${git(["rev-parse", "origin/release"])}\n`);
});

test("a run with no pull request that scopes from anything but origin/main fails", () => {
  expect(scopeRun("").githubEnv).toBe(`SCOPE=${git(["rev-list", "--max-parents=0", "HEAD"])}\n`);
});

test("a scope read from anything but the full baseline report the step just restored fails", () => {
  const report = join(root, "baseline-full", "mutation.json");
  const base = git(["rev-parse", "origin/release"]);
  expect(scopeRun("release").calls).toBe(`baseline --full ${report}\nscope ${base} ${report}\n`);
});

test("a failed baseline restore that still writes a scope and passes fails", () => {
  const run = scopeRun("release", true);
  expect([run.exitCode, run.githubEnv]).toEqual([1, ""]);
});

test("a base branch missing from origin that passes fails", () => {
  expect(scopeRun("no-such-branch").exitCode).toBe(1);
});
