import { Instrumenter } from "@stryker-mutator/instrumenter";
import { Data, Effect } from "effect";

export class MutantCountError extends Data.TaggedError("MutantCountError")<{ readonly message: string }> {}

export type SourceFile = { readonly name: string; readonly content: string };

const silent = () => false;
const ignore = () => undefined;

const SILENT_LOGGER = {
  isTraceEnabled: silent,
  isDebugEnabled: silent,
  isInfoEnabled: silent,
  isWarnEnabled: silent,
  isErrorEnabled: silent,
  isFatalEnabled: silent,
  trace: ignore,
  debug: ignore,
  info: ignore,
  warn: ignore,
  error: ignore,
  fatal: ignore,
} satisfies ConstructorParameters<typeof Instrumenter>[0];

const DEFAULT_MUTATORS = { plugins: null, excludedMutations: [], ignorers: [] };

// An ignored mutant is one a `Stryker disable` comment turns off, and Stryker runs no test for it.
export function mutantCount(files: readonly SourceFile[]): Effect.Effect<number, MutantCountError> {
  return Effect.tryPromise({
    try: () => new Instrumenter(SILENT_LOGGER).instrument(files.map((file) => ({ ...file, mutate: true })), DEFAULT_MUTATORS),
    catch: (cause) => new MutantCountError({ message: `Stryker's instrumenter cannot read the scoped files: ${String(cause)}` }),
  }).pipe(Effect.map(({ mutants }) => mutants.filter(({ status }) => status !== "Ignored").length));
}
