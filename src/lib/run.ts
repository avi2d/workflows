import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Console, Effect, Exit, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

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

const writeChunk = (writer: NodeJS.WritableStream, chunk: Uint8Array) =>
  Effect.promise(
    () =>
      new Promise<void>((resolve, reject) => {
        writer.write(chunk, (error?: Error | null) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  );

const forwardTo = (writer: NodeJS.WritableStream) => (stream: Stream.Stream<Uint8Array>) =>
  Stream.runForEach(stream, (chunk) => writeChunk(writer, chunk));

export const commandPasses = Effect.fn("commandPasses")(
  function* (program: string, args: readonly string[], env: Readonly<Record<string, string>> = {}) {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const handle = yield* spawner.spawn(
      ChildProcess.make(program, args, { env, extendEnv: true, stdin: "inherit" }),
    );
    const [exitCode] = yield* Effect.all(
      [handle.exitCode, forwardTo(process.stdout)(handle.stdout), forwardTo(process.stderr)(handle.stderr)],
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
      [handle.stdout.pipe(Stream.decodeText(), Stream.mkString), forwardTo(process.stderr)(handle.stderr), handle.exitCode],
      { concurrency: "unbounded" },
    );
    return { stdout, passed: exitCode === ChildProcessSpawner.ExitCode(0) };
  },
  Effect.scoped,
);
