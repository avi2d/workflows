import { Config, Console, Data, Effect, FileSystem } from "effect";
import { optionalInput } from "../../lib/inputs.ts";
import { commandOutput } from "../../lib/run.ts";
import { writeOutputs } from "../../lib/step-output.ts";

class DocsOnlyError extends Data.TaggedError("DocsOnlyError")<{ readonly message: string }> {}

const POSIX_CLASSES: Readonly<Record<string, string>> = {
  alnum: "A-Za-z0-9",
  alpha: "A-Za-z",
  blank: " \\t",
  digit: "0-9",
  lower: "a-z",
  punct: "!-\\/:-@\\[-\`{-~",
  space: " \\t\\n\\r\\f\\v",
  upper: "A-Z",
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

// Matches as Bash's [[ path == pattern ]] does without extglob, where * also crosses /.
export function bashPatternMatches(pattern: string, path: string): boolean {
  let source = "";
  for (let at = 0; at < pattern.length; at += 1) {
    const char = pattern[at] ?? "";
    if (char === "*") source += ".*";
    else if (char === "?") source += ".";
    else if (char === "\\" && at + 1 < pattern.length) {
      at += 1;
      source += escapeLiteral(pattern[at] ?? "");
    } else if (char === "[") {
      const bracket = bracketAt(pattern, at);
      if (bracket === undefined) source += "\\[";
      else {
        source += bracket.source;
        at = bracket.end;
      }
    } else source += escapeLiteral(char);
  }
  return new RegExp(`^${source}$`, "s").test(path);
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
