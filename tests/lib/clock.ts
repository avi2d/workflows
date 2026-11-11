import { Effect } from "effect";
import { TestClock } from "effect/testing";

export const withClock = <A>(program: Effect.Effect<A>) => Effect.runPromise(program.pipe(Effect.provide(TestClock.layer())));

export function countedReads<A>(valueAt: (read: number) => A) {
  let reads = 0;
  const read = Effect.sync(() => {
    reads += 1;
    return valueAt(reads);
  });
  return { read, reads: () => reads };
}
