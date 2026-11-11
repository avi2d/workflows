import { afterAll, beforeAll, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPOSITORY = join(import.meta.dir, "../../../..");
const HISTORY = join(REPOSITORY, "tests/fixtures/mutation-scope/history.bundle");
const SCRIPT = join(REPOSITORY, "actions/mutation-scope/main.ts");

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

type ScopeRun = { readonly exitCode: number; readonly githubEnv: string; readonly calls: string; readonly stdout: string };

type Context = { readonly event?: unknown; readonly emptyScope?: boolean };

function scopeRun(baseRef: string, context: Context = {}): ScopeRun {
  const githubEnv = join(root, "github-env");
  const calls = join(root, "calls");
  const eventPath = join(root, "event.json");
  writeFileSync(githubEnv, "");
  writeFileSync(calls, "");
  writeFileSync(eventPath, JSON.stringify(context.event ?? {}));
  const result = Bun.spawnSync(["bun", SCRIPT], {
    cwd: join(root, "head"),
    env: {
      PATH: `${join(root, "bin")}:${process.env["PATH"] ?? ""}`,
      HOME: root,
      RUNNER_TEMP: root,
      GITHUB_ENV: githubEnv,
      BASE_REF: baseRef,
      GITHUB_EVENT_PATH: eventPath,
      ...(context.emptyScope === true ? { EMPTY_SCOPE: "true" } : {}),
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  return { exitCode: result.exitCode, githubEnv: readFileSync(githubEnv, "utf8"), calls: readFileSync(calls, "utf8"), stdout: result.stdout.toString() };
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "mutation-scope-"));
  Bun.spawnSync(["git", "clone", "--quiet", "--branch", "pr-head", HISTORY, "head"], { cwd: root });
  mkdirSync(join(root, "bin"));
  standIn("checks-mutation-baseline", 'echo "baseline $*" >> "$RUNNER_TEMP/calls"');
  standIn("checks-mutation-scope", 'echo "scope $*" >> "$RUNNER_TEMP/calls"; if [ -n "$EMPTY_SCOPE" ]; then printf "SCOPE=\\nSTALE_TESTS=\\n"; else echo "SCOPE=$1"; fi');
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

test("a scope that restores a report from main or reads one fails", () => {
  const base = git(["rev-parse", "origin/release"]);
  expect(scopeRun("release").calls).toBe(`scope ${base}\n`);
});

test("a base branch missing from origin that passes fails", () => {
  expect(scopeRun("no-such-branch").exitCode).toBe(1);
});

const BASE_REPOSITORY = { full_name: "avi2d/checks" };

function pullRequestEvent(userType: string, headRef: string): unknown {
  return { pull_request: { user: { login: "someone", type: userType }, head: { ref: headRef, repo: BASE_REPOSITORY }, base: { ref: "main", repo: BASE_REPOSITORY } } };
}

test("a release pull request that is scoped, or ends with no skip and its note, fails", () => {
  const run = scopeRun("main", { event: pullRequestEvent("Bot", "release/main") });
  expect(run).toMatchObject({ exitCode: 0, githubEnv: "SKIP=release\n", calls: "" });
  expect(run.stdout).toContain("::notice::mutation: a release pull request changes no source, so the run does not start");
});

test("a bot pull request that is scoped, or ends with no skip and its note, fails", () => {
  const run = scopeRun("main", { event: pullRequestEvent("Bot", "dependabot/npm_and_yarn/effect-4.0.1") });
  expect(run).toMatchObject({ exitCode: 0, githubEnv: "SKIP=bot\n", calls: "" });
  expect(run.stdout).toContain("::notice::mutation: a bot opened the pull request, so the run does not start");
});

test("a person's pull request that skips in place of scoping fails", () => {
  const run = scopeRun("release", { event: pullRequestEvent("User", "fm/some-change") });
  expect(run.githubEnv).toBe(`SCOPE=${git(["rev-parse", "origin/release"])}\n`);
});

test("a pull request with no source change that does not skip with its note fails", () => {
  const run = scopeRun("release", { event: pullRequestEvent("User", "fm/some-change"), emptyScope: true });
  expect(run).toMatchObject({ exitCode: 0, githubEnv: "SCOPE=\nSTALE_TESTS=\nSKIP=no-source\n" });
  expect(run.stdout).toContain("::notice::mutation: no source files changed, so the run does not start");
});

test("an event file that is not a pull request event that passes fails", () => {
  expect(scopeRun("release", { event: { pull_request: { user: {} } } }).exitCode).toBe(1);
});
