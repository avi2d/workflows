import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "../../../../actions/docs-only/main.sh");

let root = "";

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "docs-only-"));
  mkdirSync(join(root, "bin"));
  writeFileSync(join(root, "bin", "bunx"), '#!/bin/sh\necho "docs-only=$#:$*"\n');
  chmodSync(join(root, "bin", "bunx"), 0o755);
  writeFileSync(join(root, "output"), "earlier=kept\n");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function classify(base: string, head: string): string {
  Bun.spawnSync(["bash", SCRIPT], {
    env: { PATH: `${join(root, "bin")}:${process.env["PATH"] ?? ""}`, BASE_SHA: base, HEAD_REF: head, GITHUB_OUTPUT: join(root, "output") },
  });
  return readFileSync(join(root, "output"), "utf8");
}

test("a range that reaches checks-docs-only as other than its base and head, or drops earlier output lines, fails", () => {
  expect(classify("abc", "HEAD")).toBe("earlier=kept\ndocs-only=3:checks-docs-only abc HEAD\n");
});

test("an empty base that still passes a range to checks-docs-only fails", () => {
  expect(classify("", "HEAD")).toBe("earlier=kept\ndocs-only=1:checks-docs-only\n");
});
