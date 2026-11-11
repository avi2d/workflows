import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const SCRIPT = join(import.meta.dir, "../../../../actions/docs-only/main.sh");
const E2E_SKIP_PATHS = "*.[mM][dD] copy.json";

let root = "";

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "docs-only-"));
  mkdirSync(join(root, "bin"));
  writeFileSync(join(root, "bin", "checks-docs-only"), '#!/bin/sh\necho "docs-only=$#:$*"\n');
  chmodSync(join(root, "bin", "checks-docs-only"), 0o755);
  writeFileSync(join(root, "output"), "earlier=kept\n");
  mkdirSync(join(root, "repo"));
  git("init", "-q");
  write("src/app.ts", "app\n");
  commit();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function git(...args: readonly string[]): string {
  const identity = { GIT_AUTHOR_NAME: "seed", GIT_AUTHOR_EMAIL: "seed@example.com", GIT_COMMITTER_NAME: "seed", GIT_COMMITTER_EMAIL: "seed@example.com" };
  const env = { PATH: process.env["PATH"] ?? "", HOME: root, GIT_CONFIG_NOSYSTEM: "1", ...identity };
  const result = Bun.spawnSync(["git", ...args], { cwd: join(root, "repo"), env });
  if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr.toString()}`);
  return result.stdout.toString().trim();
}

function write(path: string, text: string): void {
  mkdirSync(dirname(join(root, "repo", path)), { recursive: true });
  writeFileSync(join(root, "repo", path), text);
}

function commit(): string {
  git("add", "-A");
  git("commit", "-qm", "change", "--allow-empty");
  return git("rev-parse", "HEAD");
}

function classify(base: string, head: string, paths = "") {
  const result = Bun.spawnSync(["bash", SCRIPT], {
    cwd: join(root, "repo"),
    env: {
      PATH: `${join(root, "bin")}:${process.env["PATH"] ?? ""}`,
      BASE_SHA: base,
      HEAD_REF: head,
      PATHS: paths,
      GITHUB_OUTPUT: join(root, "output"),
    },
  });
  return { exitCode: result.exitCode, output: readFileSync(join(root, "output"), "utf8") };
}

function changeFrom(files: Readonly<Record<string, string>>): string {
  const base = git("rev-parse", "HEAD");
  for (const [path, text] of Object.entries(files)) write(path, text);
  commit();
  return base;
}

test("a range that reaches checks-docs-only as other than its base and head, or drops earlier output lines, fails", () => {
  expect(classify("abc", "HEAD").output).toBe("earlier=kept\ndocs-only=2:abc HEAD\n");
});

test("an empty base that still passes a range to checks-docs-only fails", () => {
  expect(classify("", "HEAD").output).toBe("earlier=kept\ndocs-only=0:\n");
});

test("Markdown at any depth in any case and the root copy.json read as more than documentation fails", () => {
  const base = changeFrom({ "README.md": "a\n", "docs/guide/NOTES.MD": "b\n", "copy.json": "{}\n" });
  expect(classify(base, "HEAD", E2E_SKIP_PATHS)).toEqual({ exitCode: 0, output: "earlier=kept\ndocs-only=true\n" });
});

test.each([
  ["a code file beside Markdown", { "README.md": "a\n", "src/app.ts": "changed\n" }],
  ["a copy.json below the root", { "src/copy.json": "{}\n" }],
  ["an uppercase root COPY.JSON", { "COPY.JSON": "{}\n" }],
])("%s read as documentation fails", (_, files) => {
  const base = changeFrom(files);
  expect(classify(base, "HEAD", E2E_SKIP_PATHS)).toEqual({ exitCode: 0, output: "earlier=kept\ndocs-only=false\n" });
});

test("a code file moved to a Markdown path read as documentation fails", () => {
  const base = git("rev-parse", "HEAD");
  mkdirSync(join(root, "repo", "docs"));
  git("mv", "src/app.ts", "docs/app.md");
  commit();
  expect(classify(base, "HEAD", E2E_SKIP_PATHS).output).toBe("earlier=kept\ndocs-only=false\n");
});

test("a range that changes no file, or an empty base, read as documentation fails", () => {
  const base = git("rev-parse", "HEAD");
  commit();
  expect(classify(base, "HEAD", E2E_SKIP_PATHS).output).toBe("earlier=kept\ndocs-only=false\n");
  expect(classify("", "HEAD", E2E_SKIP_PATHS).output).toBe("earlier=kept\ndocs-only=false\ndocs-only=false\n");
});

test("a base git cannot read that still writes a verdict passes", () => {
  expect(classify("0000000000000000000000000000000000000000", "HEAD", E2E_SKIP_PATHS)).toEqual({ exitCode: 1, output: "earlier=kept\n" });
});
