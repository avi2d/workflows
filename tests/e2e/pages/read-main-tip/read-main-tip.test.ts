import { beforeEach, expect, test } from "bun:test";
import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { useScratch } from "../../lib/scratch.ts";

const SCRIPT = join(import.meta.dir, "../../../../actions/pages/read-main-tip/main.sh");
const SHA = "0123456789abcdef0123456789abcdef01234567";
const scratch = useScratch("read-main-tip");

beforeEach(() => {
  mkdirSync(scratch.at("bin"));
  scratch.write("output", "earlier=kept\n");
});

function stubGh(script: string): void {
  scratch.write("bin/gh", `#!/bin/sh\necho "$*" > "${scratch.at("args")}"\n${script}\n`);
  chmodSync(scratch.at("bin/gh"), 0o755);
}

function readTip() {
  const result = Bun.spawnSync(["bash", SCRIPT], {
    env: { PATH: `${scratch.at("bin")}:${process.env["PATH"] ?? ""}`, REPOSITORY: "owner/site", BRANCH: "main", GITHUB_OUTPUT: scratch.at("output") },
  });
  return { exitCode: result.exitCode, stdout: result.stdout.toString(), output: scratch.read("output") };
}

test("a tip read from anything but the branch's commit, or written over earlier outputs, fails", () => {
  stubGh(`echo ${SHA}`);
  expect(readTip()).toMatchObject({ exitCode: 0, output: `earlier=kept\nsha=${SHA}\n` });
  expect(scratch.read("args")).toBe("api repos/owner/site/commits/main --jq .sha\n");
});

test("a gh failure that still writes a sha passes", () => {
  stubGh("exit 1");
  expect(readTip()).toMatchObject({ exitCode: 1, output: "earlier=kept\n" });
});

test("an answer that is no full commit SHA written as the tip passes", () => {
  stubGh("echo abc1234");
  expect(readTip()).toEqual({ exitCode: 1, stdout: "::error::owner/site main names no commit: 'abc1234'\n", output: "earlier=kept\n" });
});
