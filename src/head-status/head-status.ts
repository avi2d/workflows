#!/usr/bin/env bun
import { Config, Effect } from "effect";
import { reportStatus } from "../lib/commit-status.ts";
import { runCheck } from "../lib/run.ts";

const optional = (name: string) => Config.String(name).pipe(Config.withDefault(""));

const fromEnv = Effect.gen(function* () {
  const request = yield* Config.all({
    outcome: optional("JOB_STATUS"),
    context: optional("CONTEXT"),
    headSha: optional("HEAD_SHA"),
    description: optional("DESCRIPTION"),
    attempts: optional("ATTEMPTS"),
  });
  return yield* reportStatus(request);
});

if (import.meta.main) runCheck(fromEnv);
