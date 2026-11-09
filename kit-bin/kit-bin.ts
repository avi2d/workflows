import { Console, Data, Effect } from "effect";
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const COMMAND_NAME = /^[A-Za-z0-9._-]+$/;

export class KitBinError extends Data.TaggedError("KitBinError")<{ readonly message: string }> {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sourceOf(root: string, command: string): string | undefined {
  const manifestPath = join(root, "package.json");
  if (!existsSync(manifestPath)) return undefined;
  const manifest: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
  const bins = isRecord(manifest) ? manifest["bin"] : undefined;
  const source = isRecord(bins) ? bins[command] : undefined;
  return typeof source === "string" && source !== "" ? source : undefined;
}

export function commandsOf(input: string): Effect.Effect<readonly string[], KitBinError> {
  const commands = input.split(/\s+/).filter((command) => command !== "");
  const unsafe = commands.find((command) => !COMMAND_NAME.test(command));
  if (commands.length === 0) return Effect.fail(new KitBinError({ message: "kit-bin needs at least one command in commands" }));
  if (unsafe !== undefined) return Effect.fail(new KitBinError({ message: `kit-bin cannot shim "${unsafe}", which is no command name` }));
  return Effect.succeed(commands);
}

// The shim names its target relative to the job's working directory, since a step may run it from there only.
export function shimFor(root: string, command: string): Effect.Effect<string, KitBinError> {
  return Effect.gen(function* () {
    if (existsSync(join(root, "node_modules", ".bin", command))) {
      return `#!/bin/sh\nexec "./node_modules/.bin/${command}" "$@"\n`;
    }
    const source = yield* Effect.try({
      try: () => sourceOf(root, command),
      catch: (cause) => new KitBinError({ message: `kit-bin cannot read package.json: ${String(cause)}` }),
    });
    if (source !== undefined && statSync(join(root, source), { throwIfNoEntry: false })?.isFile() === true) {
      return `#!/bin/sh\nexec bun "${source}" "$@"\n`;
    }
    return yield* new KitBinError({
      message: `kit-bin needs ./node_modules/.bin/${command} from @avi2dg/checks, or the kit's own ${source ?? `source for ${command}`}`,
    });
  });
}

export function writeShims(root: string, commands: readonly string[], binDir: string): Effect.Effect<void, KitBinError> {
  return Effect.forEach(commands, (command) =>
    shimFor(root, command).pipe(
      Effect.flatMap((shim) =>
        Effect.try({
          try: () => {
            mkdirSync(binDir, { recursive: true });
            writeFileSync(join(binDir, command), shim);
            chmodSync(join(binDir, command), 0o755);
          },
          catch: (cause) => new KitBinError({ message: `kit-bin cannot write the ${command} shim: ${String(cause)}` }),
        }),
      ),
    ),
  ).pipe(Effect.asVoid);
}

function required(name: string): Effect.Effect<string, KitBinError> {
  const value = process.env[name];
  return value === undefined || value === "" ? Effect.fail(new KitBinError({ message: `kit-bin needs ${name} set` })) : Effect.succeed(value);
}

const main = Effect.gen(function* () {
  const commands = yield* commandsOf(process.env["COMMANDS"] ?? "");
  const binDir = join(yield* required("RUNNER_TEMP"), "checks-bin");
  const githubPath = yield* required("GITHUB_PATH");
  yield* writeShims(process.cwd(), commands, binDir);
  yield* Effect.try({
    try: () => appendFileSync(githubPath, `${binDir}\n`),
    catch: (cause) => new KitBinError({ message: `kit-bin cannot write GITHUB_PATH: ${String(cause)}` }),
  });
  yield* Console.log(`kit-bin: ${commands.join(" ")} on the PATH from ${binDir}`);
}).pipe(
  Effect.catchTag("KitBinError", (error) =>
    Console.log(`::error::${error.message}`).pipe(Effect.andThen(Effect.sync(() => (process.exitCode = 1)))),
  ),
);

if (import.meta.main) Effect.runSync(main);
