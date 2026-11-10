import { beforeEach, expect, test } from "bun:test";
import { join } from "node:path";
import { useScratch } from "../../lib/scratch.ts";
import { runAction } from "../../lib/stub-api.ts";
import { recordedCalls, stubBin } from "../../lib/stub-bin.ts";

const MAIN = join(import.meta.dir, "../../../../actions/testing/affected-tests/main.ts");
const WORKERS = `--parallel=${Bun.spawnSync(["nproc"]).stdout.toString().trim()}`;

const scratch = useScratch("affected-tests");

beforeEach(() => {
  stubBin(scratch.at("bin"), "bun", 'case "$*" in *"$FAIL_ON"*) exit 1;; esac');
});

function affected(files: string, screens: string, failOn = "no such argument") {
  return runAction(MAIN, [], {
    PATH: `${scratch.at("bin")}:${process.env["PATH"] ?? ""}`,
    STUB_RECORD: scratch.at("calls"),
    FAIL_ON: failOn,
    ALWAYS: "./tests/unit",
    FILES: files,
    SCREENS: screens,
  });
}

const calls = () => recordedCalls(scratch.at("calls"));

test("affected files run without the always-run tests, or screens run with the ignores in place, fails", async () => {
  const ran = await affected("./tests/e2e/a.test.ts", "./tests/pixel/hero.test.ts");
  expect(ran.exitCode).toBe(0);
  expect(calls()).toEqual([
    ["test", "--randomize", WORKERS, "./tests/unit", "./tests/e2e/a.test.ts"],
    ["test", "--randomize", WORKERS, "--path-ignore-patterns", "", "./tests/pixel/hero.test.ts"],
  ]);
});

test("a failing first run that goes on to the screens, or passes, fails", async () => {
  const ran = await affected("./tests/e2e/a.test.ts", "./tests/pixel/hero.test.ts", "a.test.ts");
  expect(ran.exitCode).toBe(1);
  expect(calls()).toHaveLength(1);
});
