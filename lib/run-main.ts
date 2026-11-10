import { Effect } from "effect";

export function runMain(program: Effect.Effect<void, { readonly message: string }>): void {
  Effect.runSync(
    program.pipe(
      Effect.match({
        onFailure: (error) => {
          console.log(`::error::${error.message}`);
          process.exitCode = 1;
        },
        onSuccess: () => undefined,
      }),
    ),
  );
}
