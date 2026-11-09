import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mapSourceCommand, type Observed, smokeFailures } from "../../../src/ci/kit-bin-smoke.ts";

let root = "";

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "kit-bin-smoke-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("mapSourceCommand", () => {
  test("a manifest whose bin does not map the smoke command to a source that prints from source passes", () => {
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "workflows", bin: { other: "other.ts" } }));
    Effect.runSync(mapSourceCommand(root));
    const manifest: unknown = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(manifest).toEqual({ name: "workflows", bin: { "smoke-kit-source": "smoke-kit-source.ts" } });
    expect(readFileSync(join(root, "smoke-kit-source.ts"), "utf8")).toBe('console.log("from source")\n');
  });

  test("a missing package.json that maps nothing and passes fails", () => {
    expect(Effect.runSync(Effect.flip(mapSourceCommand(root))).message).toStartWith("kit-bin-smoke cannot map smoke-kit-source");
  });
});

describe("smokeFailures", () => {
  const runnerTemp = "/runner/temp";
  const good: Observed = {
    installedPath: "/runner/temp/checks-bin/checks-docs-only",
    installedOutput: "docs-only=false",
    sourceOutput: "from source",
    missingOutcome: "failure",
  };

  test("commands that run from the shims and a missing command that failed, read as a failure, fails", () => {
    expect(smokeFailures(good, runnerTemp)).toEqual([]);
  });

  test.each<[string, Partial<Observed>]>([
    ["an installed command resolved off the shims", { installedPath: "/project/node_modules/.bin/checks-docs-only" }],
    ["an installed command not on the PATH", { installedPath: undefined }],
    ["an installed command that printed something else", { installedOutput: "" }],
    ["a source command that did not run", { sourceOutput: "" }],
    ["a missing command whose kit-bin step passed", { missingOutcome: "success" }],
  ])("%s that passes the smoke fails", (_, wrong) => {
    expect(smokeFailures({ ...good, ...wrong }, runnerTemp)).toHaveLength(1);
  });
});
