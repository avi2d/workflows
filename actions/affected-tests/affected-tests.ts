import { Console, Effect } from "effect";
import { availableParallelism } from "node:os";
import { optionalInput } from "../../lib/inputs.ts";
import { commandPasses } from "../../lib/run.ts";

export type Affected = { readonly always: readonly string[]; readonly files: readonly string[]; readonly screens: readonly string[] };

export function listOf(text: string): readonly string[] {
  return text.split(/\s+/).filter((path) => path !== "");
}

// The screens sit under a path the caller's bunfig ignores, so their run clears the ignores.
export function testRuns({ always, files, screens }: Affected, workers: number): readonly (readonly string[])[] {
  const run = ["test", "--randomize", `--parallel=${workers}`];
  const tests = [...always, ...files];
  return [...(tests.length === 0 ? [] : [[...run, ...tests]]), ...(screens.length === 0 ? [] : [[...run, "--path-ignore-patterns", "", ...screens]])];
}

export const main = Effect.gen(function* () {
  const affected: Affected = {
    always: listOf(yield* optionalInput("ALWAYS")),
    files: listOf(yield* optionalInput("FILES")),
    screens: listOf(yield* optionalInput("SCREENS")),
  };
  for (const args of testRuns(affected, availableParallelism())) {
    yield* Console.log(`bun ${args.join(" ")}`);
    if (!(yield* commandPasses("bun", args))) return false;
  }
  return true;
});
