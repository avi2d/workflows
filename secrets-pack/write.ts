#!/usr/bin/env bun
import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Config, Console, Effect, Exit, FileSystem, Path, Schema } from "effect";

const PACK_VARIABLE = "CHECKS_SECRETS_PACK";

class PackMissing extends Schema.TaggedError<PackMissing>()("PackMissing", {
  message: Schema.String,
}) {}

type Target = { readonly pack: string; readonly runnerTemp: string; readonly githubEnv: string };

export const writePack = Effect.fn("writePack")(function* ({ pack, runnerTemp, githubEnv }: Target) {
  if (pack === "") {
    return yield* new PackMissing({ message: `secrets-pack needs the pack input, such as \${{ secrets.${PACK_VARIABLE} }}, and it is empty` });
  }
  const fs = yield* FileSystem.FileSystem;
  const file = (yield* Path.Path).join(runnerTemp, "secrets-pack.json");
  yield* fs.writeFileString(file, pack);
  yield* fs.writeFileString(githubEnv, `${PACK_VARIABLE}=${file}\n`, { flag: "a" });
});

const fromEnv = Effect.gen(function* () {
  const target = yield* Config.all({
    pack: Config.String("PACK").pipe(Config.withDefault("")),
    runnerTemp: Config.String("RUNNER_TEMP"),
    githubEnv: Config.String("GITHUB_ENV"),
  });
  yield* writePack(target);
});

const main = fromEnv.pipe(
  Effect.as(0),
  Effect.catch((failure) => Console.log(`::error::${failure.message}`).pipe(Effect.as(1))),
);

if (import.meta.main) {
  BunRuntime.runMain(main.pipe(Effect.provide(BunServices.layer)), {
    teardown: (exit, onExit) => onExit(Exit.isSuccess(exit) && typeof exit.value === "number" ? exit.value : 1),
  });
}
