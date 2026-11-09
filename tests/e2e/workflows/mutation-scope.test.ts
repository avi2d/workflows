import { afterAll, beforeAll, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPOSITORY = join(import.meta.dir, "../../..");
const HISTORY = join(REPOSITORY, "tests/fixtures/mutation-scope/history.bundle");
const BASE_REF_EXPRESSION = "${{ github.event.pull_request.base.ref }}";
const TOKEN_EXPRESSION = "${{ github.token }}";

let root = "";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function scopeStep(): { readonly run: string; readonly env: Record<string, unknown> } {
  const document: unknown = Bun.YAML.parse(readFileSync(join(REPOSITORY, ".github/workflows/mutation.yml"), "utf8"));
  const jobs = isRecord(document) ? document["jobs"] : undefined;
  const compare = isRecord(jobs) ? jobs["compare"] : undefined;
  const steps = isRecord(compare) && Array.isArray(compare["steps"]) ? compare["steps"] : [];
  const step: unknown = steps.find((candidate: unknown) => isRecord(candidate) && candidate["name"] === "Select mutation scope");
  if (!isRecord(step) || typeof step["run"] !== "string") throw new Error("mutation.yml compare holds no Select mutation scope step");
  return { run: step["run"], env: isRecord(step["env"]) ? step["env"] : {} };
}

function git(args: readonly string[], cwd: string): string {
  const result = Bun.spawnSync(["git", ...args], { cwd, stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr.toString()}`);
  return result.stdout.toString().trim();
}

function scopeBaseFor(baseRef: string): string {
  const { run, env } = scopeStep();
  const resolved: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    if (value === BASE_REF_EXPRESSION) resolved[name] = baseRef;
    else if (value === TOKEN_EXPRESSION) resolved[name] = "token";
    else throw new Error(`the scope step reads ${name} from ${String(value)}, which this test cannot resolve`);
  }
  const githubEnv = join(root, "github-env");
  writeFileSync(githubEnv, "");
  const result = Bun.spawnSync(["bash", "--noprofile", "--norc", "-eo", "pipefail", "-c", run], {
    cwd: join(root, "head"),
    env: { PATH: `${join(root, "bin")}:${process.env["PATH"] ?? ""}`, HOME: root, RUNNER_TEMP: root, GITHUB_ENV: githubEnv, ...resolved },
    stderr: "pipe",
  });
  if (result.exitCode !== 0) throw new Error(`the scope step failed: ${result.stderr.toString()}`);
  return readFileSync(githubEnv, "utf8").trim();
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "mutation-scope-"));
  git(["clone", "--quiet", "--branch", "pr-head", HISTORY, "head"], root);
  mkdirSync(join(root, "bin"));
  writeFileSync(join(root, "bin", "checks-mutation-baseline"), "#!/bin/sh\n");
  writeFileSync(join(root, "bin", "checks-mutation-scope"), '#!/bin/sh\necho "BASE=$1"\n');
  chmodSync(join(root, "bin", "checks-mutation-baseline"), 0o755);
  chmodSync(join(root, "bin", "checks-mutation-scope"), 0o755);
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

test("a pull request into release scoped from where it left main in place of its own base fails", () => {
  const releaseTip = git(["rev-parse", "origin/release"], join(root, "head"));
  expect(scopeBaseFor("release")).toBe(`BASE=${releaseTip}`);
});

test("a run with no pull request that scopes from anything but origin/main fails", () => {
  const firstCommit = git(["rev-list", "--max-parents=0", "HEAD"], join(root, "head"));
  expect(scopeBaseFor("")).toBe(`BASE=${firstCommit}`);
});
