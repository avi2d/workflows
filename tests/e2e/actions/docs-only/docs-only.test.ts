import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { bashPatternMatches } from "../../../../actions/docs-only/docs-only.ts";

const MAIN = join(import.meta.dir, "../../../../actions/docs-only/main.ts");
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
  const result = Bun.spawnSync([process.execPath, MAIN], {
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

const PATTERN_CASES: readonly (readonly [string, string])[] = [
  ["*.md", "docs/guide/a.md"],
  ["*.md", "a.mdx"],
  ["docs/*", "docs/a/b.ts"],
  ["?.ts", "a.ts"],
  ["?.ts", "ab.ts"],
  ["*.[mM][dD]", "NOTES.Md"],
  ["[!a]*", "a.ts"],
  ["[!a]*", "b.ts"],
  ["[^a]*", "b.ts"],
  ["[]x]", "]"],
  ["[a-c].ts", "b.ts"],
  ["[a-c].ts", "d.ts"],
  ["[a-].ts", "-.ts"],
  ["[[:digit:]]*", "1.md"],
  ["[[:upper:]]*", "readme"],
  ["\\*.md", "*.md"],
  ["\\*.md", "a.md"],
  ["[ab", "[ab"],
  ["a.b", "axb"],
  ["(x)|y+", "(x)|y+"],
  ["copy.json", "src/copy.json"],
  ["@(docs|guides)/*", "docs/a.md"],
  ["!(src)/*", "docs/a.md"],
  ["+(a).md", "aa.md"],
  ["?(a)b", "b"],
  ["?(a)b", "x(a)b"],
  ["*(x)", ""],
  ["[[:word:]]*", "a.md"],
  ["[z-a]*", "a.md"],
  ["?", "\u{1F600}"],
  ["\u{1F600}", "\u{1F600}"],
  ["docs/\u{1F4D8}*.md", "docs/\u{1F4D8}guide.md"],
  ["\\\u{1F600}", "\u{1F600}"],
  ["@(\u{1F600}|x)", "\u{1F600}"],
  ["[z-ab]", "b"],
  ["[z-ab]", "z"],
  ["[[:foo:]x]", "x"],
  ["[[:foo:]x]", "f"],
  ["[[:alpha:]]", "é"],
  ["[[:lower:]]", "é"],
  ["[[:upper:]]", "É"],
  ["[[:punct:]]", "«"],
  ["[[:digit:]]", "٣"],
  ["[[:space:]]", "\u00A0"],
  ["[[.a.]]", "a"],
  ["[[.-.]]", "-"],
  ["[[=a=]]", "a"],
  ["[[=a=]]", "b"],
  ["[[.].]]", "]"],
  ["[[=]=]x]", "x"],
  ["[[=]=]]", "[=]]"],
  ["[[=]=]]", "]"],
  ["[[=]=]x]", "==]x]"],
  ["[x[=]=]x]", "x=]x]"],
  ["[[=]=]", "[=]"],
  ["[[:]:]]", "[:]]"],
  ["[[:]:]]", "]"],
  ["[[.a.]-c]", "b"],
  ["[[.a.]-c]", "-"],
  ["[a-[.c.]]", "b"],
  ["[[=a=]-c]", "-"],
  ["[[=a=]-c]", "b"],
  ["[a-[=c=]]", "b"],
  ["[a-[:alpha:]]", "b"],
  ["[!a-[:alpha:]]", "b"],
  ["[a-[:alpha:]]", "l]"],
  ["[!a-[:alpha:]]", "b]"],
  ["[A-[:alpha:]]", "B]"],
  ["[A-[=c=]]", "c]"],
  ["[[.ab.]x]", "x"],
  ["[[.ab.]x]", "a"],
  ["[[:foo]", "f"],
  ["[[.a]", "["],
  ["[[:alpha:]", "a"],
  ["[!z-ab]", "c"],
];

const CLASS_NAMES = ["alnum", "alpha", "blank", "cntrl", "digit", "graph", "lower", "print", "punct", "space", "upper", "word", "xdigit"];
const CLASS_SAMPLE_BLOCKS: readonly (readonly [number, number])[] = [
  [0x01, 0x09],
  [0x0b, 0x3ff],
  [0x0600, 0x06ff],
  [0x1f80, 0x206f],
  [0x2100, 0x214f],
  [0x3000, 0x303f],
  [0xe000, 0xe00f],
  [0xfef0, 0xff20],
  [0x1d400, 0x1d40f],
];

test("a class whose members differ from Bash's under C.UTF-8 over the sampled blocks fails", () => {
  const chars = CLASS_SAMPLE_BLOCKS.flatMap(([from, to]) => Array.from({ length: to - from + 1 }, (_, offset) => String.fromCodePoint(from + offset)));
  const script = `while IFS= read -r c; do out=""; for k in ${CLASS_NAMES.join(" ")}; do case "$c" in [[:$k:]]) out+=1;; *) out+=0;; esac; done; printf '%s\\n' "$out"; done`;
  const bash = Bun.spawnSync(["bash", "-c", script], {
    env: { PATH: process.env["PATH"] ?? "", LC_ALL: "C.UTF-8" },
    stdin: new TextEncoder().encode(`${chars.join("\n")}\n`),
  });
  const rows = bash.stdout.toString().trimEnd().split("\n");
  expect(rows).toHaveLength(chars.length);
  const differences = chars.flatMap((char, row) =>
    CLASS_NAMES.filter((name, column) => bashPatternMatches(`[[:${name}:]]`, char) !== (rows[row]?.[column] === "1")).map((name) => `U+${(char.codePointAt(0) ?? 0).toString(16)} ${name}`),
  );
  expect(differences).toEqual([]);
});

test.each(PATTERN_CASES)("the pattern %p read against %p other than as Bash's [[ == ]] reads it fails", (pattern, path) => {
  const bash = Bun.spawnSync(["bash", "-c", '[[ $2 == $1 ]]', "bash", pattern, path], {
    env: { PATH: process.env["PATH"] ?? "", LC_ALL: "C.UTF-8" },
  });
  expect(bashPatternMatches(pattern, path)).toBe(bash.exitCode === 0);
});
