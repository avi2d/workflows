#!/usr/bin/env bun
import { Config, Effect, FileSystem } from "effect";
import { runCheck } from "../lib/run.ts";

// Spelled out, the term would sit in the commit the smoke scans, and the scan would refuse it.
export const SMOKE_TERM = ["smoke", "pack", "term"].join("-");

export const writeSmokePack = Effect.fn("writeSmokePack")(function* (githubOutput: string) {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.writeFileString(githubOutput, `json=${JSON.stringify({ names: [SMOKE_TERM] })}\n`, { flag: "a" });
});

const fromEnv = Effect.gen(function* () {
  yield* writeSmokePack(yield* Config.String("GITHUB_OUTPUT"));
  return true;
});

if (import.meta.main) runCheck(fromEnv);
