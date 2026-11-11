#!/usr/bin/env bun
import { Config, Console, Data, Duration, Effect, FileSystem } from "effect";
import { join } from "node:path";
import { retryWithGrowingWait } from "../../lib/retry.ts";
import { commandOutput, commandPasses } from "../../lib/run.ts";

const ATTEMPTS = 3;
const WAIT = Duration.seconds(10);
const ATTEMPT_SCRIPT = join(import.meta.dir, "attempt.sh");
const NOTHING_MISSING = "All system dependencies are installed.";

class PlaywrightInputError extends Data.TaggedError("PlaywrightInputError")<{ readonly message: string }> {}

type Subcommand = "install" | "install-deps";

export function browsersOf(input: string): Effect.Effect<readonly string[], PlaywrightInputError> {
  const browsers = input.split(/\s+/).filter((browser) => browser !== "");
  return browsers.length === 0 ? Effect.fail(new PlaywrightInputError({ message: "browsers names no browser" })) : Effect.succeed(browsers);
}

export function cacheKeyLine(browsers: readonly string[]): string {
  return `browsers=${browsers.join("-")}\n`;
}

// A playwright-core that only prints the apt-get command on a dry run exits 0 too, so the exit code alone decides nothing.
export function holdsSystemPackages(dryRun: { readonly stdout: string; readonly passed: boolean }): boolean {
  return dryRun.passed && dryRun.stdout.split("\n").includes(NOTHING_MISSING);
}

const installBrowsers = Effect.fn("installBrowsers")(function* (subcommand: Subcommand, browsers: readonly string[]) {
  const passed = yield* retryWithGrowingWait(commandPasses("bash", [ATTEMPT_SCRIPT, "playwright-core", subcommand, ...browsers]), {
    attempts: ATTEMPTS,
    wait: WAIT,
    onRetry: (attempt) => Console.log(`playwright-core ${subcommand} attempt ${attempt} failed or stalled, retrying`),
  });
  if (!passed) {
    yield* Console.log(`::error::playwright-core ${subcommand} failed or stalled on all ${ATTEMPTS} attempts, each stopped at 180 seconds`);
  }
  return passed;
});

const installSystemPackages = Effect.fn("installSystemPackages")(function* (browsers: readonly string[]) {
  const dryRun = yield* commandOutput("bunx", ["playwright-core", "install-deps", "--dry-run", ...browsers]);
  yield* Console.log(dryRun.stdout.trimEnd());
  if (!holdsSystemPackages(dryRun)) return yield* installBrowsers("install-deps", browsers);
  yield* Console.log("the machine already holds the system packages, so apt-get does not run");
  return true;
});

const writeCacheKey = Effect.fn("writeCacheKey")(function* (browsers: readonly string[]) {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.writeFileString(yield* Config.String("GITHUB_OUTPUT"), cacheKeyLine(browsers), { flag: "a" });
  return true;
});

export const main = Effect.gen(function* () {
  const browsers = yield* browsersOf(yield* Config.String("BROWSERS").pipe(Config.withDefault("")));
  const mode = process.argv[2];
  if (mode === "cache-key") return yield* writeCacheKey(browsers);
  if (mode === "install") return yield* installBrowsers(mode, browsers);
  if (mode === "install-deps") return yield* installSystemPackages(browsers);
  return yield* new PlaywrightInputError({ message: `playwright.ts takes cache-key, install or install-deps, not ${mode ?? "nothing"}` });
});
