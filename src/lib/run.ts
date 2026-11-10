import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Console, Effect, Exit, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { writeSync } from "node:fs";

// Runs a check as a CI step: a false result or a failure exits 1, and a failure prints as an error annotation.
export function runCheck<E extends { readonly message: string }>(check: Effect.Effect<boolean, E, BunServices.BunServices>): void {
  const exitCode = check.pipe(
    Effect.map((passed) => (passed ? 0 : 1)),
    Effect.catch((failure) => Console.log(`::error::${failure.message}`).pipe(Effect.as(1))),
  );
  BunRuntime.runMain(exitCode.pipe(Effect.provide(BunServices.layer)), {
    teardown: (exit, onExit) => onExit(Exit.isSuccess(exit) && typeof exit.value === "number" ? exit.value : 1),
  });
}

function writeAll(fd: number, chunk: Uint8Array): void {
  let offset = 0;
  while (offset < chunk.length) {
    offset += writeSync(fd, chunk.subarray(offset));
  }
}

const forwardTo = (fd: number) => (stream: Stream.Stream<Uint8Array>) =>
  Stream.runForEach(stream, (chunk) => Effect.sync(() => writeAll(fd, chunk)));

export const commandPasses = Effect.fn("commandPasses")(
  function* (program: string, args: readonly string[], env: Readonly<Record<string, string>> = {}) {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const handle = yield* spawner.spawn(
      ChildProcess.make(program, args, { env, extendEnv: true, stdin: "inherit" }),
    );
    const [exitCode] = yield* Effect.all(
      [handle.exitCode, forwardTo(1)(handle.stdout), forwardTo(2)(handle.stderr)],
      { concurrency: "unbounded" },
    );
    return exitCode === ChildProcessSpawner.ExitCode(0);
  },
  Effect.scoped,
);

export const commandOutput = Effect.fn("commandOutput")(
  function* (program: string, args: readonly string[]) {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const handle = yield* spawner.spawn(ChildProcess.make(program, args, { extendEnv: true, stdin: "inherit" }));
    const [stdout, exitCode] = yield* Effect.all(
      [handle.stdout.pipe(Stream.decodeText(), Stream.mkString), forwardTo(2)(handle.stderr), handle.exitCode],
      { concurrency: "unbounded" },
    );
    return { stdout, passed: exitCode === ChildProcessSpawner.ExitCode(0) };
  },
  Effect.scoped,
);
