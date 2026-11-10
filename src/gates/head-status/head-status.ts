#!/usr/bin/env bun
import { Config, Effect } from "effect";
import { reportStatus } from "../../lib/commit-status.ts";

const optional = (name: string) => Config.String(name).pipe(Config.withDefault(""));

export const main = Effect.gen(function* () {
  const request = yield* Config.all({
    outcome: optional("JOB_STATUS"),
    context: optional("CONTEXT"),
    headSha: optional("HEAD_SHA"),
    description: optional("DESCRIPTION"),
    attempts: optional("ATTEMPTS"),
  });
  return yield* reportStatus(request);
});
