import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "../../../src/ci/heavy-slot-smoke.sh");

let runnerTemp = "";

beforeEach(() => {
  runnerTemp = mkdtempSync(join(tmpdir(), "heavy-slot-smoke-"));
  writeFileSync(join(runnerTemp, "path"), "");
});

afterEach(() => {
  rmSync(runnerTemp, { recursive: true, force: true });
});

function smoke(mode: string, unknown = "failure") {
  const env = { PATH: process.env["PATH"] ?? "", RUNNER_TEMP: runnerTemp, GITHUB_PATH: join(runnerTemp, "path"), UNKNOWN: unknown };
  return Bun.spawnSync(["bash", SCRIPT, mode], { env }).exitCode;
}

function slot(action: string): void {
  Bun.spawnSync([join(runnerTemp, "bin", "heavy-slot-stub"), action], { env: { RUNNER_TEMP: runnerTemp } });
}

test("a stub that logs nothing, or stays off GITHUB_PATH, fails", () => {
  expect(smoke("stub")).toBe(0);
  slot("acquire");
  expect(readFileSync(join(runnerTemp, "heavy-slot.log"), "utf8")).toBe("acquire\n");
  expect(readFileSync(join(runnerTemp, "path"), "utf8")).toBe(`${join(runnerTemp, "bin")}\n`);
});

test("an acquire then release log that is refused fails", () => {
  smoke("stub");
  slot("acquire");
  slot("release");
  expect(smoke("verify")).toBe(0);
});

test("a log with an extra call, or an unknown action that passed, that passes fails", () => {
  smoke("stub");
  slot("acquire");
  slot("acquire");
  slot("release");
  expect(smoke("verify")).toBe(1);
  rmSync(join(runnerTemp, "heavy-slot.log"));
  slot("acquire");
  slot("release");
  expect(smoke("verify", "success")).toBe(1);
});
