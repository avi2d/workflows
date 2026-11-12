import { Console, Data, Effect } from "effect";
import { optionalInput } from "../../lib/inputs.ts";

class RequireSuccessError extends Data.TaggedError("RequireSuccessError")<{ readonly message: string }> {}

const wordsOf = (text: string) => text.split(/\s+/).filter((word) => word !== "");

function passes(pair: string, expectedSkips: ReadonlySet<string>): boolean {
  const separator = pair.indexOf("=");
  const result = pair.slice(separator + 1);
  return result === "success" || (result === "skipped" && expectedSkips.has(`${pair.slice(0, separator)}=true`));
}

export const main = Effect.gen(function* () {
  const results = wordsOf(yield* optionalInput("RESULTS"));
  const expectedSkips = new Set(wordsOf(yield* optionalInput("SKIPS")));
  if (results.length === 0) return yield* new RequireSuccessError({ message: "require-success needs at least one name=result in results" });
  const bare = results.find((pair) => !pair.includes("="));
  if (bare !== undefined) return yield* new RequireSuccessError({ message: `require-success takes name=result pairs, not '${bare}'` });
  const failed = results.filter((pair) => !passes(pair, expectedSkips));
  if (failed.length > 0) return yield* new RequireSuccessError({ message: `${failed.join(" ")}, where each result must be success, or skipped where skips names it true` });
  yield* Console.log(results.join(" "));
});
