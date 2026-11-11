import { expect, test } from "bun:test";
import { join } from "node:path";
import { useScratch } from "../lib/scratch.ts";
import { runAction } from "../lib/stub-api.ts";
import { recordedCalls, stubBin } from "../lib/stub-bin.ts";

const SCRIPT = join(import.meta.dir, "../../../ci/release-smoke.ts");
const HEAD = "1111111111111111111111111111111111111111";
const DISPATCHED = JSON.stringify({
  workflow_run_id: 77,
  run_url: "https://api.github.com/repos/owner/shared/actions/runs/77",
  html_url: "https://github.com/owner/shared/actions/runs/77",
});
const ANSWERS = [
  'case "$*" in',
  `  *dispatches*) echo '${DISPATCHED}'; exit "\${DISPATCH_EXIT:-0}" ;;`,
  `  *) echo '{"status":"completed","head_sha":"'"$RAN_SHA"'"}' ;;`,
  "esac",
].join("\n");

const scratch = useScratch("release-smoke");

function smoke(overrides: Readonly<Record<string, string>> = {}) {
  stubBin(scratch.at("bin"), "gh", ANSWERS);
  return runAction(SCRIPT, [], {
    PATH: `${scratch.at("bin")}:${process.env["PATH"] ?? ""}`,
    STUB_RECORD: scratch.at("calls"),
    GITHUB_REPOSITORY: "owner/shared",
    GITHUB_OUTPUT: scratch.at("output"),
    REF: "feature/pick",
    HEAD_SHA: HEAD,
    RAN_SHA: HEAD,
    ...overrides,
  });
}

test("a smoke started off the head branch, without its run asked for, or whose run id stays unwritten fails", async () => {
  const ran = await smoke();
  expect(ran.stdout).not.toContain("::error::");
  expect(ran.exitCode).toBe(0);
  expect(recordedCalls(scratch.at("calls"))).toEqual([
    ["api", "--method", "POST", "repos/owner/shared/actions/workflows/release-smoke.yml/dispatches", "-f", "ref=feature/pick", "-F", "return_run_details=true"],
    ["api", "repos/owner/shared/actions/runs/77"],
  ]);
  expect(scratch.read("output")).toBe("run-id=77\n");
});

test("a smoke that ran another commit than the head and passes fails", async () => {
  const other = "2222222222222222222222222222222222222222";
  const ran = await smoke({ RAN_SHA: other });
  expect(ran.stdout).toContain(`::error::the release smoke ran ${other}, where the head ${HEAD} was wanted`);
  expect(ran.exitCode).toBe(1);
});

test("a dispatch GitHub refuses, as it does for a read-only token, that passes fails", async () => {
  const ran = await smoke({ DISPATCH_EXIT: "1" });
  expect(ran.stdout).toContain("::error::gh api could not start release-smoke.yml on feature/pick");
  expect(ran.exitCode).toBe(1);
  expect(recordedCalls(scratch.at("calls"))).toHaveLength(1);
});
