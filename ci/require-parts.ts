import { Console, Data, Effect } from "effect";
import { runMain } from "../lib/run-main.ts";

// head-status runs only on pull requests, so a dispatch may skip it.
export const MAY_SKIP_OFF_PULL_REQUEST: ReadonlySet<string> = new Set(["head-status"]);

export class RequirePartsError extends Data.TaggedError("RequirePartsError")<{ readonly message: string }> {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function resultsOf(needs: string): Effect.Effect<ReadonlyMap<string, string>, RequirePartsError> {
  return Effect.try({
    try: (): unknown => JSON.parse(needs),
    catch: (cause) => new RequirePartsError({ message: `require-parts cannot read NEEDS: ${String(cause)}` }),
  }).pipe(
    Effect.flatMap((parsed) => {
      if (!isRecord(parsed) || Object.keys(parsed).length === 0) {
        return Effect.fail(new RequirePartsError({ message: "require-parts needs NEEDS to name at least one part" }));
      }
      return Effect.succeed(
        new Map(Object.entries(parsed).map(([part, need]) => [part, isRecord(need) ? String(need["result"]) : "missing"])),
      );
    }),
  );
}

export function failedParts(results: ReadonlyMap<string, string>, event: string): string[] {
  return [...results]
    .filter(([part, result]) => {
      if (result === "success") return false;
      return !(result === "skipped" && event !== "pull_request" && MAY_SKIP_OFF_PULL_REQUEST.has(part));
    })
    .map(([part, result]) => `${part}=${result}`);
}

const main = Effect.gen(function* () {
  const results = yield* resultsOf(process.env["NEEDS"] ?? "");
  const failed = failedParts(results, process.env["EVENT"] ?? "");
  if (failed.length > 0) return yield* new RequirePartsError({ message: `require-parts: ${failed.join(" ")}` });
  yield* Console.log(`require-parts: ${[...results.keys()].join(" ")} pass`);
});

if (import.meta.main) runMain(main);
