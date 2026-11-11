import { Config, Console, Data, Effect, FileSystem } from "effect";
import { optionalInput } from "../../lib/inputs.ts";
import { commandOutput } from "../../lib/run.ts";
import { writeOutputs } from "../../lib/step-output.ts";

class DocsOnlyError extends Data.TaggedError("DocsOnlyError")<{ readonly message: string }> {}

const POSIX_CLASSES: Readonly<Record<string, string>> = {
  alnum: "A-Za-z0-9",
  alpha: "A-Za-z",
  blank: " \\t",
  cntrl: "\\x00-\\x1F\\x7F",
  digit: "0-9",
  graph: "\\x21-\\x7E",
  lower: "a-z",
  print: "\\x20-\\x7E",
  punct: "!-\\/:-@\\[-\`{-~",
  space: " \\t\\n\\r\\f\\v",
  upper: "A-Z",
  word: "A-Za-z0-9_",
  xdigit: "0-9A-Fa-f",
};

const escapeLiteral = (char: string) => char.replace(/[\\^$.*+?()[\]{}|/-]/g, "\\$&");

function bracketAt(pattern: string, open: number): { readonly source: string; readonly end: number } | undefined {
  let at = open + 1;
  const negated = pattern[at] === "!" || pattern[at] === "^";
  if (negated) at += 1;
  let body = "";
  for (let first = true; at < pattern.length; first = false) {
    const char = pattern[at] ?? "";
    if (char === "]" && !first) return { source: `[${negated ? "^" : ""}${body}]`, end: at };
    const posix = /^\[:([a-z]+):\]/.exec(pattern.slice(at));
    if (posix !== null) {
      const members = POSIX_CLASSES[posix[1] ?? ""];
      if (members === undefined) return undefined;
      body += members;
      at += posix[0].length;
      continue;
    }
    if (char === "\\" && at + 1 < pattern.length) {
      body += escapeLiteral(pattern[at + 1] ?? "");
      at += 2;
      continue;
    }
    body += char === "-" && !first && pattern[at + 1] !== "]" ? "-" : escapeLiteral(char);
    at += 1;
  }
  return undefined;
}

// Matches as Bash's [[ path == pattern ]] does, where * also crosses /.
export function bashPatternMatches(pattern: string, path: string): boolean {
  return matchNodes(parsePattern(pattern), path, new Set([0])).has(path.length);
}

type PatternNode =
  | { readonly kind: "literal"; readonly char: string }
  | { readonly kind: "any" }
  | { readonly kind: "star" }
  | { readonly kind: "bracket"; readonly test: (char: string) => boolean }
  | { readonly kind: "extglob"; readonly op: string; readonly arms: readonly (readonly PatternNode[])[] };

function parsePattern(pattern: string): readonly PatternNode[] {
  return parseSequence(pattern, 0, false).nodes;
}

function parseSequence(pattern: string, at: number, nested: boolean): { readonly nodes: readonly PatternNode[]; readonly end: number; readonly stop: string | undefined } {
  const nodes: PatternNode[] = [];
  let cursor = at;
  while (cursor < pattern.length) {
    const char = pattern[cursor] ?? "";
    if ((char === "|" || char === ")") && nested) return { nodes, end: cursor, stop: char };
    const extglob = parseExtglob(pattern, cursor);
    if (extglob !== undefined) {
      nodes.push(extglob.node);
      cursor = extglob.end;
      continue;
    }
    if (char === "*" && (pattern[cursor + 1] ?? "") !== "(") {
      nodes.push({ kind: "star" });
      cursor += 1;
    } else if (char === "?" && (pattern[cursor + 1] ?? "") !== "(") {
      nodes.push({ kind: "any" });
      cursor += 1;
    } else if (char === "\\" && cursor + 1 < pattern.length) {
      nodes.push({ kind: "literal", char: pattern[cursor + 1] ?? "" });
      cursor += 2;
    } else if (char === "[") {
      const bracket = bracketAt(pattern, cursor);
      if (bracket === undefined) {
        nodes.push({ kind: "literal", char: "[" });
        cursor += 1;
      } else {
        const expression = new RegExp(`^${bracket.source}$`, "s");
        nodes.push({ kind: "bracket", test: (value) => expression.test(value) });
        cursor = bracket.end + 1;
      }
    } else {
      nodes.push({ kind: "literal", char });
      cursor += 1;
    }
  }
  return { nodes, end: cursor, stop: undefined };
}

function parseExtglob(pattern: string, at: number): { readonly node: PatternNode; readonly end: number } | undefined {
  const op = pattern[at] ?? "";
  if (op !== "*" && op !== "?" && op !== "+" && op !== "@" && op !== "!") return undefined;
  if ((pattern[at + 1] ?? "") !== "(") return undefined;
  const arms: PatternNode[][] = [];
  let cursor = at + 2;
  while (true) {
    const parsed = parseSequence(pattern, cursor, true);
    if (parsed.stop === "|") {
      arms.push([...parsed.nodes]);
      cursor = parsed.end + 1;
    } else if (parsed.stop === ")") {
      arms.push([...parsed.nodes]);
      return { node: { kind: "extglob", op, arms }, end: parsed.end + 1 };
    } else return undefined;
  }
}

function matchNodes(nodes: readonly PatternNode[], path: string, starts: ReadonlySet<number>): Set<number> {
  let current = new Set(starts);
  for (const node of nodes) {
    const next = new Set<number>();
    for (const pos of current) for (const end of matchOne(node, path, pos)) next.add(end);
    current = next;
    if (current.size === 0) break;
  }
  return current;
}

function matchOne(node: PatternNode, path: string, pos: number): Set<number> {
  switch (node.kind) {
    case "literal":
      return path[pos] === node.char ? new Set([pos + 1]) : new Set();
    case "any":
      return pos < path.length ? new Set([pos + 1]) : new Set();
    case "star": {
      const ends = new Set<number>();
      for (let end = pos; end <= path.length; end += 1) ends.add(end);
      return ends;
    }
    case "bracket":
      return pos < path.length && node.test(path[pos] ?? "") ? new Set([pos + 1]) : new Set();
    case "extglob":
      return matchExtglob(node.op, node.arms, path, pos);
  }
}

function matchExtglob(op: string, arms: readonly (readonly PatternNode[])[], path: string, pos: number): Set<number> {
  if (op === "!") {
    const ends = new Set<number>();
    for (let end = pos; end <= path.length; end += 1) {
      const taken = path.slice(pos, end);
      if (!arms.some((arm) => matchNodes(arm, taken, new Set([0])).has(taken.length))) ends.add(end);
    }
    return ends;
  }
  const once = new Set<number>();
  for (const arm of arms) for (const end of matchNodes(arm, path, new Set([pos]))) once.add(end);
  if (op === "@") return once;
  if (op === "?") {
    once.add(pos);
    return once;
  }
  const ends = new Set<number>(op === "*" ? [pos, ...once] : [...once]);
  let frontier = new Set<number>(once);
  while (frontier.size > 0) {
    const step = new Set<number>();
    for (const start of frontier)
      for (const arm of arms)
        for (const end of matchNodes(arm, path, new Set([start])))
          if (!ends.has(end)) {
            ends.add(end);
            step.add(end);
          }
    frontier = step;
  }
  return ends;
}

const wordsOf = (text: string) => text.split(/\s+/).filter((word) => word !== "");

const git = Effect.fn("git")(function* (...args: readonly string[]) {
  const { stdout, passed } = yield* commandOutput("git", args);
  if (!passed) return yield* new DocsOnlyError({ message: `git ${args.join(" ")} failed` });
  return stdout;
});

const pathsVerdict = Effect.fn("pathsVerdict")(function* (base: string, head: string, paths: string) {
  if (base === "") return false;
  const mergeBase = (yield* git("merge-base", base, head)).trim();
  // Without --no-renames a file moved into docs/ would list only its new path.
  const changed = (yield* git("-c", "core.quotePath=false", "diff", "--no-renames", "--name-only", mergeBase, head)).split("\n").filter((path) => path !== "");
  if (changed.length === 0) return false;
  const patterns = wordsOf(paths);
  const unmatched = changed.find((path) => !patterns.some((pattern) => bashPatternMatches(pattern, path)));
  if (unmatched === undefined) return true;
  yield* Console.error(`docs-only: ${unmatched} matches none of ${paths}`);
  return false;
});

// An empty base passes no range, and checks-docs-only then reports false.
const kitVerdict = Effect.fn("kitVerdict")(function* (base: string, head: string) {
  const { stdout, passed } = yield* commandOutput("checks-docs-only", base === "" ? [] : [base, head]);
  const fs = yield* FileSystem.FileSystem;
  yield* fs.writeFileString(yield* Config.String("GITHUB_OUTPUT"), stdout, { flag: "a" });
  return passed;
});

export const main = Effect.gen(function* () {
  const base = yield* optionalInput("BASE_SHA");
  const head = yield* optionalInput("HEAD_REF");
  const paths = yield* optionalInput("PATHS");
  if (paths === "") return yield* kitVerdict(base, head);
  const verdict = String(yield* pathsVerdict(base, head, paths));
  yield* Console.log(`docs-only=${verdict}`);
  yield* writeOutputs({ "docs-only": verdict });
  return true;
});
