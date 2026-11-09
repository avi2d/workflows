import { Console, Data, Effect } from "effect";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runMain } from "../lib/run-main.ts";

export const SOURCE_COMMAND = "smoke-kit-source";
export const SOURCE_FILE = "smoke-kit-source.ts";
export const SOURCE_OUTPUT = "from source";
export const INSTALLED_COMMAND = "checks-docs-only";
export const INSTALLED_OUTPUT = "docs-only=false";

export class KitBinSmokeError extends Data.TaggedError("KitBinSmokeError")<{ readonly message: string }> {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function mapSourceCommand(root: string): Effect.Effect<void, KitBinSmokeError> {
  return Effect.try({
    try: () => {
      const manifest: unknown = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
      if (!isRecord(manifest)) throw new Error("package.json holds no object");
      writeFileSync(join(root, SOURCE_FILE), `console.log(${JSON.stringify(SOURCE_OUTPUT)})\n`);
      writeFileSync(join(root, "package.json"), JSON.stringify({ ...manifest, bin: { [SOURCE_COMMAND]: SOURCE_FILE } }, null, 2));
    },
    catch: (cause) => new KitBinSmokeError({ message: `kit-bin-smoke cannot map ${SOURCE_COMMAND}: ${String(cause)}` }),
  });
}

export interface Observed {
  readonly installedPath: string | undefined;
  readonly installedOutput: string;
  readonly sourceOutput: string;
  readonly missingOutcome: string;
}

export function smokeFailures(observed: Observed, runnerTemp: string): string[] {
  const failures: string[] = [];
  const shim = join(runnerTemp, "checks-bin", INSTALLED_COMMAND);
  if (observed.installedPath !== shim) failures.push(`${INSTALLED_COMMAND} resolves to ${observed.installedPath ?? "nothing"}, not ${shim}`);
  if (observed.installedOutput !== INSTALLED_OUTPUT) failures.push(`${INSTALLED_COMMAND} printed "${observed.installedOutput}"`);
  if (observed.sourceOutput !== SOURCE_OUTPUT) failures.push(`${SOURCE_COMMAND} printed "${observed.sourceOutput}"`);
  if (observed.missingOutcome !== "failure") failures.push(`kit-bin on a missing command ended in ${observed.missingOutcome}`);
  return failures;
}

function outputOf(command: string): string {
  const result = Bun.spawnSync([command], { stderr: "inherit" });
  return result.stdout.toString().trim();
}

function required(name: string): Effect.Effect<string, KitBinSmokeError> {
  const value = process.env[name];
  return value === undefined || value === "" ? Effect.fail(new KitBinSmokeError({ message: `kit-bin-smoke needs ${name} set` })) : Effect.succeed(value);
}

const verify = Effect.gen(function* () {
  const runnerTemp = yield* required("RUNNER_TEMP");
  const observed: Observed = {
    installedPath: Bun.which(INSTALLED_COMMAND) ?? undefined,
    installedOutput: yield* Effect.try({ try: () => outputOf(INSTALLED_COMMAND), catch: (cause) => new KitBinSmokeError({ message: String(cause) }) }),
    sourceOutput: yield* Effect.try({ try: () => outputOf(SOURCE_COMMAND), catch: (cause) => new KitBinSmokeError({ message: String(cause) }) }),
    missingOutcome: process.env["MISSING"] ?? "",
  };
  const failures = smokeFailures(observed, runnerTemp);
  if (failures.length > 0) return yield* new KitBinSmokeError({ message: failures.join("; ") });
  yield* Console.log("kit-bin-smoke: installed and source commands run from the shims, and a missing command fails");
});

const main = Effect.gen(function* () {
  const mode = process.argv[2];
  if (mode === "fixture") return yield* mapSourceCommand(process.cwd());
  if (mode === "verify") return yield* verify;
  return yield* new KitBinSmokeError({ message: `kit-bin-smoke takes fixture or verify, not ${mode ?? "nothing"}` });
});

if (import.meta.main) runMain(main);
