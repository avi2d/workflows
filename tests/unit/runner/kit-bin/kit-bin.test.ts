import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commandsOf, type KitBinError, shimFor, writeShims } from "../../../../src/runner/kit-bin/kit-bin.ts";

let root = "";

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "kit-bin-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function install(command: string): void {
  mkdirSync(join(root, "node_modules", ".bin"), { recursive: true });
  writeFileSync(join(root, "node_modules", ".bin", command), "#!/bin/sh\n");
}

function mapSource(command: string, source: string, write: boolean): void {
  writeFileSync(join(root, "package.json"), JSON.stringify({ bin: { [command]: source } }));
  if (!write) return;
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, source), "");
}

function failureOf<A>(effect: Effect.Effect<A, KitBinError>): string {
  return Effect.runSync(Effect.flip(effect)).message;
}

describe("shimFor", () => {
  test("an installed command shimmed to the kit source in place of the install fails", () => {
    install("checks-tool");
    mapSource("checks-tool", "src/tool.ts", true);
    expect(Effect.runSync(shimFor(root, "checks-tool"))).toBe('#!/bin/sh\nexec "./node_modules/.bin/checks-tool" "$@"\n');
  });

  test("a kit source command left off the PATH fails", () => {
    mapSource("checks-tool", "src/tool.ts", true);
    expect(Effect.runSync(shimFor(root, "checks-tool"))).toBe('#!/bin/sh\nexec bun "src/tool.ts" "$@"\n');
  });

  test("a bin mapped to a missing source that resolves passes", () => {
    mapSource("checks-tool", "src/gone.ts", false);
    expect(failureOf(shimFor(root, "checks-tool"))).toBe(
      "kit-bin needs ./node_modules/.bin/checks-tool from @avi2dg/checks, or the kit's own src/gone.ts",
    );
  });

  test("a command with neither an install nor a manifest that resolves passes", () => {
    expect(failureOf(shimFor(root, "checks-tool"))).toBe(
      "kit-bin needs ./node_modules/.bin/checks-tool from @avi2dg/checks, or the kit's own source for checks-tool",
    );
  });

  test("a manifest whose bin is one string read as a command map passes", () => {
    writeFileSync(join(root, "package.json"), JSON.stringify({ bin: "src/tool.ts" }));
    expect(failureOf(shimFor(root, "checks-tool"))).toContain("source for checks-tool");
  });
});

describe("commandsOf", () => {
  test("a commands list split anywhere but on whitespace fails", () => {
    expect(Effect.runSync(commandsOf(" checks-a\n checks-b  checks-c "))).toEqual(["checks-a", "checks-b", "checks-c"]);
  });

  test("an empty commands input that shims nothing and passes fails", () => {
    expect(failureOf(commandsOf("  "))).toBe("kit-bin needs at least one command in commands");
  });

  test("a command name that would escape the shim path or its quotes passes", () => {
    expect(failureOf(commandsOf('checks-a ../x"'))).toContain('"../x""');
  });
});

describe("writeShims", () => {
  test("a shim that is not executable or that misses a command fails", () => {
    install("checks-a");
    mapSource("checks-b", "src/b.ts", true);
    const binDir = join(root, "temp", "checks-bin");
    Effect.runSync(writeShims(root, ["checks-a", "checks-b"], binDir));
    expect(readFileSync(join(binDir, "checks-a"), "utf8")).toContain("./node_modules/.bin/checks-a");
    expect(readFileSync(join(binDir, "checks-b"), "utf8")).toContain('bun "src/b.ts"');
    expect(statSync(join(binDir, "checks-a")).mode & 0o777).toBe(0o755);
    expect(statSync(join(binDir, "checks-b")).mode & 0o777).toBe(0o755);
  });
});
