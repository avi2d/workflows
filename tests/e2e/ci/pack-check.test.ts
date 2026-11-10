import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SMOKE_TERM } from "../../../ci/smoke-pack.ts";

const SCRIPT = join(import.meta.dir, "../../../ci/pack-check.ts");
const PACK = JSON.stringify({ names: [SMOKE_TERM] });
const SCAN_TIMEOUT = 60_000;

let runnerTemp = "";

beforeEach(() => {
  runnerTemp = mkdtempSync(join(tmpdir(), "pack-check-"));
});

afterEach(() => {
  rmSync(runnerTemp, { recursive: true, force: true });
});

function packCheckOnRunStartedBy(sender: string) {
  const pack = join(runnerTemp, "secrets-pack.json");
  const event = join(runnerTemp, "event.json");
  writeFileSync(pack, PACK);
  writeFileSync(event, JSON.stringify({ pull_request: {}, sender: { login: sender } }));
  const env = { ...process.env, RUNNER_TEMP: runnerTemp, CHECKS_SECRETS_PACK: pack, PACK, GITHUB_EVENT_PATH: event };
  return Bun.spawnSync(["bun", SCRIPT], { env, stdin: "ignore", timeout: SCAN_TIMEOUT });
}

test(
  "a pack the job built that the scan leaves unread on a run Dependabot started fails",
  () => {
    const { exitCode, stdout } = packCheckOnRunStartedBy("dependabot[bot]");
    expect(stdout.toString()).not.toContain("::error::");
    expect(exitCode).toBe(0);
  },
  SCAN_TIMEOUT,
);
