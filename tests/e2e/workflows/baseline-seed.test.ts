import { expect, test } from "bun:test";
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { isRecord, workflowSteps } from "../../lib/workflow.ts";
import { useScratch } from "../lib/scratch.ts";

const REPOSITORY = join(import.meta.dir, "../../..");
const MUTATION = join(REPOSITORY, ".github/workflows/mutation.yml");
const STATE = "reports/stryker-incremental.json";
const WHEN_NO_STATE = `hashFiles('${STATE}') == ''`;
const REFRESHED_AT = "2026-11-11T12:00:00Z";
const MERGED = { schemaVersion: "1.0", files: { "src/a.ts": { mutants: [{ id: "0", status: "Killed", static: true }] } }, testFiles: {} };
const SAVED = { ...MERGED, files: {} };
const ARTIFACT = '{"artifacts":[{"id":1,"name":"%s","expired":false,"workflow_run":{"id":7,"repository_id":1}}]}';
const GH = [
  "#!/bin/sh",
  'name=$(echo "$2" | cut -d= -f2)',
  'case "$1 $2" in',
  `  "run list") echo '[{"databaseId":7,"event":"workflow_dispatch","createdAt":"${REFRESHED_AT}"}]' ;;`,
  '  "run view") printf \'{"headSha":"%s"}\' "$(git rev-parse HEAD)" ;;',
  '  "run download") cp -r "$ARTIFACTS/$5/." "$7" ;;',
  `  *) test -d "$ARTIFACTS/$name" && printf '${ARTIFACT}' "$name" || echo '{"artifacts":[]}' ;;`,
  "esac",
  "",
].join("\n");

const scratch = useScratch("baseline-seed");

function stepsOf(job: string): readonly Record<string, unknown>[] {
  return workflowSteps(MUTATION, job);
}

function uploadOf(job: string): { readonly name: string; readonly path: string } {
  const step = stepsOf(job).find((candidate) => String(candidate["uses"] ?? "").startsWith("actions/upload-artifact@"));
  const inputs = isRecord(step?.["with"]) ? step["with"] : {};
  return { name: String(inputs["name"]), path: String(inputs["path"]).replace("${{ runner.temp }}", scratch.at("temp")) };
}

function runEnv(): Record<string, string> {
  const path = [scratch.at("bin"), join(REPOSITORY, "node_modules/.bin"), process.env["PATH"] ?? ""].join(delimiter);
  const identity = { GIT_AUTHOR_NAME: "seed", GIT_AUTHOR_EMAIL: "seed@example.com", GIT_COMMITTER_NAME: "seed", GIT_COMMITTER_EMAIL: "seed@example.com" };
  const runner = { RUNNER_TEMP: scratch.at("temp"), RUNNER_ENVIRONMENT: "github-hosted", CHECKS_MUTATION_BASELINE_NOW_MS: String(Date.parse(REFRESHED_AT)) };
  return { PATH: path, HOME: scratch.at(), ARTIFACTS: scratch.at("artifacts"), ...identity, ...runner };
}

function sh(command: string): void {
  const { exitCode, stderr } = Bun.spawnSync(["bash", "-e", "-c", command], { cwd: scratch.at("repo"), env: runEnv() });
  if (exitCode !== 0) throw new Error(`${command}: ${stderr.toString()}`);
}

function isDue(step: Record<string, unknown>): boolean {
  if (step["if"] === undefined) return true;
  if (step["if"] === WHEN_NO_STATE) return !existsSync(scratch.at("repo", STATE));
  throw new Error(`no reading of the condition ${String(step["if"])}`);
}

function runBetween(job: string, after: string, before: string): void {
  const steps = stepsOf(job);
  const starts = (prefix: string) => steps.findIndex((step) => String(step["run"] ?? step["uses"] ?? "").startsWith(prefix));
  for (const step of steps.slice(starts(after) + 1, starts(before))) {
    if (typeof step["run"] === "string" && isDue(step)) sh(step["run"]);
  }
}

function put(file: string, content: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(content));
}

function stateAfterARefreshThenABaseline(): unknown {
  mkdirSync(scratch.at("bin"));
  writeFileSync(scratch.at("bin", "gh"), GH);
  chmodSync(scratch.at("bin", "gh"), 0o755);
  mkdirSync(scratch.at("repo"));
  sh("git init --quiet && git commit --quiet --allow-empty --message seed");
  put(scratch.at("repo", "reports/mutation/mutation.json"), MERGED);
  runBetween("refresh-merge", "checks-mutation-merge ", "actions/upload-artifact@");
  cpSync(uploadOf("refresh-merge").path, scratch.at("artifacts", uploadOf("refresh-merge").name), { recursive: true });
  rmSync(scratch.at("repo", "reports"), { recursive: true });
  runBetween("baseline", "avi2d/workflows/kit-bin@", "bunx stryker run");
  return JSON.parse(readFileSync(scratch.at("repo", STATE), "utf8"));
}

test("a baseline with no saved state that starts from nothing after a refresh fails", () => {
  expect(stateAfterARefreshThenABaseline()).toEqual(MERGED);
});

test("a baseline that drops its own saved state for the last refresh fails", () => {
  put(scratch.at("artifacts", uploadOf("baseline").name, "stryker-incremental.json"), SAVED);
  expect(stateAfterARefreshThenABaseline()).toEqual(SAVED);
});
