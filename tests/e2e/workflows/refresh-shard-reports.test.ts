import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { isRecord, workflowSteps } from "../../lib/workflow.ts";

const MUTATION = join(import.meta.dir, "../../../.github/workflows/mutation.yml");
const JOB_INDEX = "${{ strategy.job-index }}";
const MERGE = "checks-mutation-merge";
const PRINTS_THE_SHARD_REPORTS = '#!/usr/bin/env bash\nshift\nprintf \'%s\\n\' "$@"\n';

let workspace = "";

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "refresh-shards-"));
  mkdirSync(join(workspace, "bin"));
  writeFileSync(join(workspace, "bin", MERGE), PRINTS_THE_SHARD_REPORTS);
  chmodSync(join(workspace, "bin", MERGE), 0o755);
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

function stepsOf(job: string): readonly Record<string, unknown>[] {
  return workflowSteps(MUTATION, job);
}

function inputsOf(job: string, action: string): Record<string, unknown> {
  const step = stepsOf(job).find((candidate) => String(candidate["uses"] ?? "").startsWith(`actions/${action}@`));
  if (!isRecord(step?.["with"])) throw new Error(`mutation.yml ${job} calls no ${action} with inputs`);
  return step["with"];
}

function mergeCommand(): string {
  const step = stepsOf("refresh-merge").find((candidate) => String(candidate["run"] ?? "").startsWith(`${MERGE} `));
  if (step === undefined) throw new Error(`mutation.yml refresh-merge runs no ${MERGE}`);
  return String(step["run"]);
}

// download-artifact puts one matched artifact, or every artifact under merge-multiple, straight into path, and each of several into a folder named after it.
function downloadedReports(shards: number): string[] {
  const upload = inputsOf("refresh-shard", "upload-artifact");
  const download = inputsOf("refresh-merge", "download-artifact");
  const flat = shards === 1 || download["merge-multiple"] === true;
  return Array.from({ length: shards }, (_, index) => {
    const artifact = String(upload["name"]).replace(JOB_INDEX, String(index));
    const report = basename(String(upload["path"]).replace(JOB_INDEX, String(index)));
    const placed = flat ? join(String(download["path"]), report) : join(String(download["path"]), artifact, report);
    mkdirSync(join(workspace, dirname(placed)), { recursive: true });
    writeFileSync(join(workspace, placed), `shard ${index}`);
    return placed;
  });
}

function reportsTheMergeReads(): string[] {
  const env = { ...process.env, PATH: `${join(workspace, "bin")}:${process.env["PATH"] ?? ""}` };
  const { stdout } = Bun.spawnSync(["bash", "-e", "-c", mergeCommand()], { cwd: workspace, env });
  return stdout.toString().trim().split("\n").toSorted();
}

test.each([1, 2, 4])("a refresh of %d shard(s) whose merge misses or overwrites a shard's report fails", (shards) => {
  const downloaded = downloadedReports(shards);
  expect(new Set(downloaded).size).toBe(shards);
  expect(reportsTheMergeReads()).toEqual(downloaded.toSorted());
});
