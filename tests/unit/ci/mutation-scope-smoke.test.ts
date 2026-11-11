import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expectedSkipFromEnv, scopeFailure, skipFailure, unexpectedSkipFailure, writeStandIns } from "../../../ci/mutation-scope-smoke.ts";

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
  });

  test("a stand-in restore command, which would let a scope that restores from main pass, fails", () => {
    Effect.runSync(writeStandIns(join(root, "bin")));
    expect(existsSync(join(root, "bin", "checks-mutation-baseline"))).toBe(false);
  });
});

describe("expectedSkipFromEnv", () => {
  test("a release head in the same repository read as no skip fails", () => {
    expect(
      expectedSkipFromEnv({
        EXPECT_HEAD_REF: "release/main",
        EXPECT_BASE_REF: "main",
        EXPECT_HEAD_REPO: "avi2d/checks",
        EXPECT_BASE_REPO: "avi2d/checks",
        EXPECT_USER_TYPE: "Bot",
      }),
    ).toBe("release");
  });

  test("a bot head other than a release branch read as no skip fails", () => {
    expect(
      expectedSkipFromEnv({
        EXPECT_HEAD_REF: "dependabot/npm_and_yarn/effect-4.0.1",
        EXPECT_BASE_REF: "main",
        EXPECT_HEAD_REPO: "avi2d/checks",
        EXPECT_BASE_REPO: "avi2d/checks",
        EXPECT_USER_TYPE: "Bot",
      }),
    ).toBe("bot");
  });

  test("a person's head read as a skip fails", () => {
    expect(
      expectedSkipFromEnv({
        EXPECT_HEAD_REF: "fm/some-change",
        EXPECT_BASE_REF: "main",
        EXPECT_HEAD_REPO: "avi2d/checks",
        EXPECT_BASE_REPO: "avi2d/checks",
        EXPECT_USER_TYPE: "User",
      }),
    ).toBeUndefined();
  });

  test("a fork's release branch read as a release skip fails", () => {
    expect(
      expectedSkipFromEnv({
        EXPECT_HEAD_REF: "release/main",
        EXPECT_BASE_REF: "main",
        EXPECT_HEAD_REPO: "someone/checks",
        EXPECT_BASE_REPO: "avi2d/checks",
        EXPECT_USER_TYPE: "User",
      }),
    ).toBeUndefined();
  });
});

describe("unexpectedSkipFailure", () => {
  test("a SKIP on a person's pull request read as no failure fails", () => {
    expect(unexpectedSkipFailure("bot")).toBeString();
  });

  test.each([[undefined], [""]])("no SKIP read as a failure fails", (skip) => {
    expect(unexpectedSkipFailure(skip)).toBeUndefined();
  });
});

describe("skipFailure", () => {
  test("a release pull request whose SKIP is release read as a failure fails", () => {
    expect(skipFailure("release", "release")).toBeUndefined();
  });

  test.each([["bot"], [undefined], [""]])("a release pull request with SKIP %p that passes fails", (skip) => {
    expect(skipFailure("release", skip)).toBeString();
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
