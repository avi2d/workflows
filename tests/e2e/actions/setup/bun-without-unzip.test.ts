import { beforeEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { useScratch } from "../../lib/scratch.ts";
import { recordedCalls, stubBin } from "../../lib/stub-bin.ts";

const SCRIPT = join(import.meta.dir, "../../../../actions/setup/main.sh");
const NPM_LEAVES_A_PLACEHOLDER_THAT_FAILS = [
  'package="$4/node_modules/bun"',
  '/bin/mkdir -p "$package/bin"',
  'printf "#!/bin/sh\\nexit 1\\n" > "$package/bin/bun.exe"',
  '/bin/chmod +x "$package/bin/bun.exe"',
  'printf "%s" "${5#bun@}" > "$package/version"',
].join("\n");
const INSTALL_JS_SWAPS_IN_A_BUN_THAT_PRINTS_ITS_VERSION = [
  'package="${1%/install.js}"',
  'printf "#!/bin/sh\\necho %s\\n" "$(/bin/cat "$package/version")" > "$package/bin/bun.exe"',
].join("\n");

const scratch = useScratch("bun-without-unzip");

function onPath(tool: string): string {
  const found = Bun.which(tool);
  if (found === null) throw new Error(`the test machine has no ${tool}`);
  return found;
}

beforeEach(() => {
  mkdirSync(scratch.at("bin"));
  mkdirSync(scratch.at("repository"));
  for (const tool of ["bash", "install"]) symlinkSync(onPath(tool), scratch.at("bin", tool));
  scratch.write("repository/.bun-version", "1.4.3\n");
});

function setup(part: string, extraEnv: Record<string, string> = {}) {
  const env = { PATH: scratch.at("bin"), HOME: scratch.at("home"), RUNNER_TEMP: scratch.at("temp"), STUB_RECORD: scratch.at("calls"), ...extraEnv };
  const result = Bun.spawnSync([onPath("bash"), SCRIPT, part], { cwd: scratch.at("repository"), env });
  return { exitCode: result.exitCode, stdout: result.stdout.toString() };
}

test("an image without unzip that is left with npm's placeholder, or without the pinned Bun, where setup-bun looks for one fails", () => {
  stubBin(scratch.at("bin"), "npm", NPM_LEAVES_A_PLACEHOLDER_THAT_FAILS);
  stubBin(scratch.at("bin"), "node", INSTALL_JS_SWAPS_IN_A_BUN_THAT_PRINTS_ITS_VERSION);
  expect(setup("bun-without-unzip")).toEqual({ exitCode: 0, stdout: "1.4.3\n" });
  expect(recordedCalls(scratch.at("calls"))).toEqual([
    ["install", "--ignore-scripts", "--prefix", scratch.at("temp", "bun-from-npm"), "bun@1.4.3"],
    [scratch.at("temp", "bun-from-npm/node_modules/bun/install.js")],
  ]);
  expect(Bun.spawnSync([scratch.at("home", ".bun/bin/bun"), "--version"]).stdout.toString()).toBe("1.4.3\n");
});

test("a version from the environment that the file on disk replaces fails", () => {
  stubBin(scratch.at("bin"), "npm", NPM_LEAVES_A_PLACEHOLDER_THAT_FAILS);
  stubBin(scratch.at("bin"), "node", INSTALL_JS_SWAPS_IN_A_BUN_THAT_PRINTS_ITS_VERSION);
  expect(setup("bun-without-unzip", { BUN_VERSION: "1.4.4" })).toEqual({ exitCode: 0, stdout: "1.4.4\n" });
  expect(recordedCalls(scratch.at("calls"))).toEqual([
    ["install", "--ignore-scripts", "--prefix", scratch.at("temp", "bun-from-npm"), "bun@1.4.4"],
    [scratch.at("temp", "bun-from-npm/node_modules/bun/install.js")],
  ]);
  expect(Bun.spawnSync([scratch.at("home", ".bun/bin/bun"), "--version"]).stdout.toString()).toBe("1.4.4\n");
});

test("an image with unzip that fetches Bun through npm in place of setup-bun fails", () => {
  stubBin(scratch.at("bin"), "unzip", "");
  stubBin(scratch.at("bin"), "npm", NPM_LEAVES_A_PLACEHOLDER_THAT_FAILS);
  expect(setup("bun-without-unzip")).toEqual({ exitCode: 0, stdout: "" });
  expect(recordedCalls(scratch.at("calls"))).toEqual([]);
  expect(existsSync(scratch.at("home", ".bun/bin/bun"))).toBe(false);
});

test("an image with neither unzip nor npm that passes fails", () => {
  expect(setup("bun-without-unzip")).toEqual({
    exitCode: 1,
    stdout: "::error::setup found no unzip for setup-bun, and no npm to fetch Bun without it\n",
  });
});

test("a part main.sh does not know that passes fails", () => {
  expect(setup("install-node")).toEqual({
    exitCode: 1,
    stdout: "::error::setup's main.sh takes require-bun-version, bun-without-unzip or bun-held, not 'install-node'\n",
  });
});
