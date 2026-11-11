import { describe, expect, test } from "bun:test";
import { Effect, Fiber, Option } from "effect";
import { TestClock } from "effect/testing";
import { newestStatus, READ_TRIES, READ_WAIT, statusProblem, waitForStatus, type Status } from "../../../ci/status-check.ts";
import { countedReads, withClock } from "../../lib/clock.ts";

const FOUND: Status = { state: "success", description: "the chosen head and description" };

const statusReads = (foundFrom: number) => countedReads((read) => (read >= foundFrom ? Option.some(FOUND) : Option.none<Status>()));

const waitAMinute = (read: Effect.Effect<Option.Option<Status>>) =>
  withClock(
    Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(waitForStatus(read, READ_TRIES, READ_WAIT));
      yield* TestClock.adjust("1 minute");
      return yield* Fiber.join(fiber);
    }),
  );

describe("waitForStatus", () => {
  test("a status that never appears read other than 6 times, or reported found, fails", async () => {
    const reads = statusReads(Infinity);
    const found = await waitAMinute(reads.read);
    expect(reads.reads()).toBe(6);
    expect(Option.isNone(found)).toBe(true);
  });

  test("a second read before 5 seconds pass fails", async () => {
    const reads = statusReads(Infinity);
    const counts = await withClock(
      Effect.gen(function* () {
        yield* Effect.forkChild(waitForStatus(reads.read, READ_TRIES, READ_WAIT));
        yield* TestClock.adjust("4999 millis");
        const early = reads.reads();
        yield* TestClock.adjust("1 millis");
        return [early, reads.reads()];
      }),
    );
    expect(counts).toEqual([1, 2]);
  });

  test("a read after the status appears fails", async () => {
    const reads = statusReads(3);
    const found = await waitAMinute(reads.read);
    expect(reads.reads()).toBe(3);
    expect(found).toEqual(Option.some(FOUND));
  });
});

describe("newestStatus", () => {
  test("an older status picked over the newest for the same context fails", () => {
    const statuses = [
      { context: "other", state: "pending", description: null },
      { context: "commitlint", state: "success", description: null },
      { context: "commitlint", state: "failure", description: null },
    ];
    expect(newestStatus(statuses, "commitlint")).toEqual(Option.some({ state: "success", description: null }));
    expect(Option.isNone(newestStatus(statuses, "missing"))).toBe(true);
  });
});

describe("statusProblem", () => {
  test("a missing status, another state or another asked description that passes fails", () => {
    expect(Option.isSome(statusProblem(Option.none(), "success", Option.none()))).toBe(true);
    expect(Option.isSome(statusProblem(Option.some(FOUND), "failure", Option.none()))).toBe(true);
    expect(Option.isSome(statusProblem(Option.some(FOUND), "success", Option.some("another")))).toBe(true);
  });

  test("a matching status, or one whose description was not asked, that fails fails", () => {
    expect(Option.isNone(statusProblem(Option.some(FOUND), "success", Option.some("the chosen head and description")))).toBe(true);
    expect(Option.isNone(statusProblem(Option.some(FOUND), "success", Option.none()))).toBe(true);
  });
});
