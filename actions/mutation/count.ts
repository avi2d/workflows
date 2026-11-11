import { Data, Effect } from "effect";
import { instrumentedMutantCount } from "./instrumenter/instrument.ts";

export class MutantCountError extends Data.TaggedError("MutantCountError")<{ readonly message: string }> {}

export type SourceFile = { readonly name: string; readonly content: string };

export function mutantCount(files: readonly SourceFile[]): Effect.Effect<number, MutantCountError> {
  return Effect.tryPromise({
    try: () => instrumentedMutantCount(files),
    catch: (cause) => new MutantCountError({ message: `Stryker's instrumenter cannot read the scoped files: ${String(cause)}` }),
  });
}
