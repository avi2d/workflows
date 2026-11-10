import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scopeFailure, writeStandIns } from "../../../ci/mutation-scope-smoke.ts";

let root = "";

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "mutation-scope-smoke-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("writeStandIns", () => {
  test("a stand-in scope command that does not echo its base as SCOPE, or is not executable, passes", () => {
    Effect.runSync(writeStandIns(join(root, "bin")));
    expect(readFileSync(join(root, "bin", "checks-mutation-scope"), "utf8")).toBe('#!/bin/sh\necho "SCOPE=$1"\n');
    expect(statSync(join(root, "bin", "checks-mutation-scope")).mode & 0o111).toBe(0o111);
    expect(statSync(join(root, "bin", "checks-mutation-baseline")).mode & 0o111).toBe(0o111);
  });
});

describe("scopeFailure", () => {
  test("a SCOPE equal to the merge base with origin/main read as a failure fails", () => {
    expect(scopeFailure("abc123", "abc123")).toBeUndefined();
  });

  test.each([["def456"], [undefined], [""]])("a SCOPE of %p that is not the merge base and passes fails", (scope) => {
    expect(scopeFailure(scope, "abc123")).toBeString();
  });

  test("a checkout with no merge base with origin/main that passes fails", () => {
    expect(scopeFailure("", "")).toBeString();
  });
});
