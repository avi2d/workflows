import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "../../../actions/setup/main.sh");

let root = "";

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "require-bun-version-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function requireIn(cwd: string) {
  const result = Bun.spawnSync(["bash", SCRIPT], { cwd });
  return { exitCode: result.exitCode, stdout: result.stdout.toString() };
}

test("a root without .bun-version that passes, or fails without an annotation on that file, fails", () => {
  expect(requireIn(root)).toEqual({ exitCode: 1, stdout: "::error file=.bun-version::setup needs a .bun-version file at the repository root\n" });
});

test("a root with .bun-version that is refused fails", () => {
  writeFileSync(join(root, ".bun-version"), "1.4.3\n");
  expect(requireIn(root)).toEqual({ exitCode: 0, stdout: "" });
});
