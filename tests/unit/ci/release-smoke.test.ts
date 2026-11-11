import { describe, expect, test } from "bun:test";
import { Effect, Fiber, Option } from "effect";
import { TestClock } from "effect/testing";
import { runProblem, waitForRun, type Run } from "../../../ci/release-smoke.ts";
import { countedReads, withClock } from "../../lib/clock.ts";

const HEAD = "1111111111111111111111111111111111111111";
const DONE: Run = { status: "completed", head_sha: HEAD };
const RUNNING: Run = { status: "in_progress", head_sha: HEAD };

const runReads = (doneFrom: number) => countedReads((read) => (read >= doneFrom ? DONE : RUNNING));

describe("waitForRun", () => {
  test("a run that never completes given up on before 590 seconds, read past the job's 15 minutes, or reported completed, fails", async () => {
    const reads = runReads(Infinity);
    const seen = await withClock(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(waitForRun(reads.read));
        yield* TestClock.adjust("589999 millis");
        const beforeLastRead = reads.reads();
        yield* TestClock.adjust("1 hour");
        return [beforeLastRead, reads.reads(), (yield* Fiber.join(fiber)).status];
      }),
    );
    expect(seen).toEqual([59, 60, "in_progress"]);
  });

  test("a read after the run completes fails", async () => {
    const reads = runReads(3);
    const run = await withClock(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(waitForRun(reads.read));
        yield* TestClock.adjust("1 hour");
        return yield* Fiber.join(fiber);
      }),
    );
    expect(run).toEqual(DONE);
    expect(reads.reads()).toBe(3);
  });
});

describe("runProblem", () => {
  test("a completed run of the head commit that reports a problem fails", () => {
    expect(Option.isNone(runProblem(DONE, HEAD))).toBe(true);
  });

  test.each([["queued"], ["in_progress"], [null]])("a run still %p that passes fails", (status) => {
    expect(Option.isSome(runProblem({ status, head_sha: HEAD }, HEAD))).toBe(true);
  });

  test("a run of another commit than the head that passes fails", () => {
    const other = "2222222222222222222222222222222222222222";
    expect(runProblem({ status: "completed", head_sha: other }, HEAD)).toEqual(
      Option.some(`the release smoke ran ${other}, where the head ${HEAD} was wanted`),
    );
  });
});
