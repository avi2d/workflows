import { beforeEach, expect, test } from "bun:test";
import { mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { useScratch } from "../../lib/scratch.ts";
import { stubBin } from "../../lib/stub-bin.ts";

const SCRIPT = join(import.meta.dir, "../../../../actions/setup/main.sh");
const PINNED = readFileSync(join(import.meta.dir, "../../../../.bun-version"), "utf8").trim();
const scratch = useScratch("bun-held");

beforeEach(() => {
  mkdirSync(scratch.at("bin"));
  const bash = Bun.which("bash");
  if (bash === null) throw new Error("the test machine has no bash");
  symlinkSync(bash, scratch.at("bin", "bash"));
  scratch.write("output", "");
});

function bunHeld() {
  const result = Bun.spawnSync([scratch.at("bin", "bash"), SCRIPT, "bun-held"], { env: { PATH: scratch.at("bin"), GITHUB_OUTPUT: scratch.at("output") } });
  return { exitCode: result.exitCode, output: readFileSync(scratch.at("output"), "utf8") };
}

test("a job holding Bun that is told to install another over it fails", () => {
  stubBin(scratch.at("bin"), "bun", "");
  expect(bunHeld()).toEqual({ exitCode: 0, output: `held=true\nversion=${PINNED}\n` });
});

test("a job without Bun that is told it holds one fails", () => {
  expect(bunHeld()).toEqual({ exitCode: 0, output: `held=false\nversion=${PINNED}\n` });
});
