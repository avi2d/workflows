import { Config, Console, Data, Effect, FileSystem } from "effect";
import { optionalInput } from "../../lib/inputs.ts";
import { commandOutput } from "../../lib/run.ts";
import { writeOutputs } from "../../lib/step-output.ts";

class DocsOnlyError extends Data.TaggedError("DocsOnlyError")<{ readonly message: string }> {}

type CharTest = (char: string) => boolean;

const never: CharTest = () => false;
const matching =
  (expression: RegExp): CharTest =>
  (char) =>
    expression.test(char);

const NON_BREAKING_SPACE = /[\u00A0\u2007\u202F]/u;
const isBlank: CharTest = (char) => char === "\t" || (/\p{Zs}/u.test(char) && !NON_BREAKING_SPACE.test(char));
const isSpace: CharTest = (char) => /[\t-\r\u2028\u2029]/u.test(char) || isBlank(char);
const isAlnum = matching(/[\p{Alphabetic}\p{Nd}]/u);
const isPrint: CharTest = (char) => !/[\p{Cc}\p{Cs}\p{Cn}\u2028\u2029]/u.test(char);
const isGraph: CharTest = (char) => isPrint(char) && !isSpace(char);

// The member sets of glibc's C.UTF-8, the runner's locale, which Bash reads its classes from.
const POSIX_CLASSES: Readonly<Record<string, CharTest>> = {
  alnum: isAlnum,
  alpha: (char) => isAlnum(char) && !/[0-9]/.test(char),
  blank: isBlank,
  cntrl: matching(/[\p{Cc}\u2028\u2029]/u),
  digit: matching(/[0-9]/),
  graph: isGraph,
  // glibc counts these four titlecase digraphs as lower and the other titlecase letters as upper only.
  lower: matching(/[\p{Lowercase}\u01C5\u01C8\u01CB\u01F2]/u),
  print: isPrint,
  punct: (char) => isGraph(char) && !isAlnum(char),
  space: isSpace,
  upper: matching(/[\p{Uppercase}\p{Lt}]/u),
  word: matching(/[\p{Alphabetic}\p{Nd}_]/u),
  xdigit: matching(/[0-9A-Fa-f]/),
};

type BracketElement =
  | { readonly kind: "char"; readonly char: string }
  | { readonly kind: "collating"; readonly char: string | undefined }
  | { readonly kind: "equivalence"; readonly char: string | undefined }
  | { readonly kind: "class"; readonly test: CharTest };

const BRACKET_FORMS = { ":": "class", ".": "collating", "=": "equivalence" } as const;

function bracketElementAt(symbols: readonly string[], at: number): { readonly element: BracketElement; readonly next: number } {
  const char = symbols[at] ?? "";
  const delimiter = symbols[at + 1] ?? "";
  if (char === "[" && (delimiter === ":" || delimiter === "." || delimiter === "=")) {
    for (let close = at + 2; close + 1 < symbols.length; close += 1) {
      if (symbols[close] !== delimiter || symbols[close + 1] !== "]") continue;
      const name = symbols.slice(at + 2, close);
      const next = close + 2;
      const kind = BRACKET_FORMS[delimiter];
      if (kind === "class") return { element: { kind, test: POSIX_CLASSES[name.join("")] ?? never }, next };
      return { element: { kind, char: name.length === 1 ? name[0] : undefined }, next };
    }
  }
  if (char === "\\" && at + 1 < symbols.length) return { element: { kind: "char", char: symbols[at + 1] ?? "" }, next: at + 2 };
  return { element: { kind: "char", char }, next: at + 1 };
}

function memberTest(element: BracketElement): CharTest {
  if (element.kind === "class") return element.test;
  const { char } = element;
  return char === undefined ? never : (value) => value === char;
}

function rangeTest(low: string | undefined, high: string | undefined): CharTest {
  if (low === undefined || high === undefined) return never;
  const from = low.codePointAt(0) ?? 0;
  const to = high.codePointAt(0) ?? 0;
  return (char) => {
    const point = char.codePointAt(0) ?? 0;
    return from <= point && point <= to;
  };
}

function bracketAt(symbols: readonly string[], open: number): { readonly test: CharTest; readonly end: number } | undefined {
  let at = open + 1;
  const negated = symbols[at] === "!" || symbols[at] === "^";
  if (negated) at += 1;
  const members: CharTest[] = [];
  let hasCloseEquivalence = false;
  for (let first = true; at < symbols.length; first = false) {
    if (symbols[at] === "]" && !first) {
      if (hasCloseEquivalence) return { test: never, end: at };
      return { test: (char) => negated !== members.some((member) => member(char)), end: at };
    }
    const { element, next } = bracketElementAt(symbols, at);
    if (element.kind === "equivalence" && element.char === "]") hasCloseEquivalence = true;
    at = next;
    const low = "char" in element ? element.char : undefined;
    const startsRange = (element.kind === "char" || element.kind === "collating") && symbols[at] === "-" && at + 1 < symbols.length && symbols[at + 1] !== "]";
    if (!startsRange) {
      members.push(memberTest(element));
      continue;
    }
    if (symbols[at + 1] === "[" && (symbols[at + 2] === ":" || symbols[at + 2] === "=")) {
      members.push(rangeTest(low, "["));
      at += 2;
      continue;
    }
    const high = bracketElementAt(symbols, at + 1);
    if (high.element.kind === "equivalence" && high.element.char === "]") hasCloseEquivalence = true;
    at = high.next;
    members.push(rangeTest(low, "char" in high.element ? high.element.char : undefined));
  }
  return undefined;
}

// Matches as Bash's [[ path == pattern ]] does, where * also crosses /.
export function bashPatternMatches(pattern: string, path: string): boolean {
  const chars = Array.from(path);
  return matchNodes(parsePattern(pattern), chars, new Set([0])).has(chars.length);
}

type PatternNode =
  | { readonly kind: "literal"; readonly char: string }
  | { readonly kind: "any" }
  | { readonly kind: "star" }
  | { readonly kind: "bracket"; readonly test: (char: string) => boolean }
  | { readonly kind: "extglob"; readonly op: string; readonly arms: readonly (readonly PatternNode[])[] };

function parsePattern(pattern: string): readonly PatternNode[] {
  return parseSequence(Array.from(pattern), 0, false).nodes;
}

function parseSequence(symbols: readonly string[], at: number, nested: boolean): { readonly nodes: readonly PatternNode[]; readonly end: number; readonly stop: string | undefined } {
  const nodes: PatternNode[] = [];
  let cursor = at;
  while (cursor < symbols.length) {
    const char = symbols[cursor] ?? "";
    if ((char === "|" || char === ")") && nested) return { nodes, end: cursor, stop: char };
    const extglob = parseExtglob(symbols, cursor);
    if (extglob !== undefined) {
      nodes.push(extglob.node);
      cursor = extglob.end;
      continue;
    }
    if (char === "*" && (symbols[cursor + 1] ?? "") !== "(") {
      nodes.push({ kind: "star" });
      cursor += 1;
    } else if (char === "?" && (symbols[cursor + 1] ?? "") !== "(") {
      nodes.push({ kind: "any" });
      cursor += 1;
    } else if (char === "\\" && cursor + 1 < symbols.length) {
      nodes.push({ kind: "literal", char: symbols[cursor + 1] ?? "" });
      cursor += 2;
    } else if (char === "[") {
      const bracket = bracketAt(symbols, cursor);
      if (bracket === undefined) {
        nodes.push({ kind: "literal", char: "[" });
        cursor += 1;
      } else {
        nodes.push({ kind: "bracket", test: bracket.test });
        cursor = bracket.end + 1;
      }
    } else {
      nodes.push({ kind: "literal", char });
      cursor += 1;
    }
  }
  return { nodes, end: cursor, stop: undefined };
}

function parseExtglob(symbols: readonly string[], at: number): { readonly node: PatternNode; readonly end: number } | undefined {
  const op = symbols[at] ?? "";
  if (op !== "*" && op !== "?" && op !== "+" && op !== "@" && op !== "!") return undefined;
  if ((symbols[at + 1] ?? "") !== "(") return undefined;
  const arms: PatternNode[][] = [];
  let cursor = at + 2;
  while (true) {
    const parsed = parseSequence(symbols, cursor, true);
    if (parsed.stop === "|") {
      arms.push([...parsed.nodes]);
      cursor = parsed.end + 1;
    } else if (parsed.stop === ")") {
      arms.push([...parsed.nodes]);
      return { node: { kind: "extglob", op, arms }, end: parsed.end + 1 };
    } else return undefined;
  }
}

function matchNodes(nodes: readonly PatternNode[], chars: readonly string[], starts: ReadonlySet<number>): Set<number> {
  let current = new Set(starts);
  for (const node of nodes) {
    const next = new Set<number>();
    for (const pos of current) for (const end of matchOne(node, chars, pos)) next.add(end);
    current = next;
    if (current.size === 0) break;
  }
  return current;
}

function matchOne(node: PatternNode, chars: readonly string[], pos: number): Set<number> {
  switch (node.kind) {
    case "literal":
      return chars[pos] === node.char ? new Set([pos + 1]) : new Set();
    case "any":
      return pos < chars.length ? new Set([pos + 1]) : new Set();
    case "star": {
      const ends = new Set<number>();
      for (let end = pos; end <= chars.length; end += 1) ends.add(end);
      return ends;
    }
    case "bracket":
      return pos < chars.length && node.test(chars[pos] ?? "") ? new Set([pos + 1]) : new Set();
    case "extglob":
      return matchExtglob(node.op, node.arms, chars, pos);
  }
}

function matchExtglob(op: string, arms: readonly (readonly PatternNode[])[], chars: readonly string[], pos: number): Set<number> {
  if (op === "!") {
    const ends = new Set<number>();
    for (let end = pos; end <= chars.length; end += 1) {
      const taken = chars.slice(pos, end);
      if (!arms.some((arm) => matchNodes(arm, taken, new Set([0])).has(taken.length))) ends.add(end);
    }
    return ends;
  }
  const once = new Set<number>();
  for (const arm of arms) for (const end of matchNodes(arm, chars, new Set([pos]))) once.add(end);
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
        for (const end of matchNodes(arm, chars, new Set([start])))
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
