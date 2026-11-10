#!/usr/bin/env bun
import { Config, Console, Data, Effect, FileSystem } from "effect";
import { commandOutput, runCheck } from "../lib/run.ts";

class DocsOnlySmokeError extends Data.TaggedError("DocsOnlySmokeError")<{ readonly message: string }> {}

export type Readings = { readonly docs: string; readonly code: string; readonly none: string };

export function readingProblems({ docs, code, none }: Readings): readonly string[] {
  return [
    ...(docs === "true" ? [] : [`a README change read as docs-only=${docs}`]),
    ...(code === "false" ? [] : [`a code change read as docs-only=${code}`]),
    ...(none === "false" ? [] : [`an empty base read as docs-only=${none}`]),
  ];
}

export function commitsLines(commits: { readonly base: string; readonly docs: string; readonly code: string }): string {
  return `base=${commits.base}\ndocs=${commits.docs}\ncode=${commits.code}\n`;
}

const git = Effect.fn("git")(function* (...args: readonly string[]) {
  const { stdout, passed } = yield* commandOutput("git", args);
  if (!passed) return yield* new DocsOnlySmokeError({ message: `git ${args.join(" ")} failed` });
  return stdout.trim();
});

const commit = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  yield* git("config", "user.name", "github-actions");
  yield* git("config", "user.email", "github-actions@users.noreply.github.com");
  const base = yield* git("rev-parse", "HEAD");
  yield* fs.writeFileString("README.md", "smoke\n", { flag: "a" });
  yield* git("commit", "-qam", "docs: smoke");
  const docs = yield* git("rev-parse", "HEAD");
  yield* fs.writeFileString("smoke.txt", "smoke\n");
  yield* git("add", "smoke.txt");
  yield* git("commit", "-qm", "chore: smoke");
  const code = yield* git("rev-parse", "HEAD");
  yield* fs.writeFileString(yield* Config.String("GITHUB_OUTPUT"), commitsLines({ base, docs, code }), { flag: "a" });
  return true;
});

const verify = Effect.gen(function* () {
  const readings = yield* Config.all({ docs: Config.String("DOCS"), code: Config.String("CODE"), none: Config.String("NONE") });
  yield* Console.log(`docs=${readings.docs} code=${readings.code} none=${readings.none}`);
  const problems = readingProblems(readings);
  yield* Effect.forEach(problems, (problem) => Console.log(`::error::${problem}`));
  return problems.length === 0;
});

const main = Effect.gen(function* () {
  const mode = process.argv[2];
  if (mode === "commit") return yield* commit;
  if (mode === "verify") return yield* verify;
  return yield* new DocsOnlySmokeError({ message: `docs-only-smoke takes commit or verify, not ${mode ?? "nothing"}` });
});

if (import.meta.main) runCheck(main);
