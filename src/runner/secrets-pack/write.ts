#!/usr/bin/env bun
import { Config, Effect, FileSystem, Path, Schema } from "effect";

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

export const main = Effect.gen(function* () {
  const target = yield* Config.all({
    pack: Config.String("PACK").pipe(Config.withDefault("")),
    runnerTemp: Config.String("RUNNER_TEMP"),
    githubEnv: Config.String("GITHUB_ENV"),
  });
  yield* writePack(target);
  return true;
});
