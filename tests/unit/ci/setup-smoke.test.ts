import { describe, expect, test } from "bun:test";
import { bunVersionProblems, checkoutProblems, dependencyProblems } from "../../../src/ci/setup-smoke.ts";

const SHA = "0123456789abcdef0123456789abcdef01234567";

describe("checkoutProblems", () => {
  test("a whole-history checkout of the asked commit that reports a problem fails", () => {
    expect(checkoutProblems({ shallow: "false", head: SHA, want: SHA })).toEqual([]);
  });

  test("a shallow checkout, or one of another commit, that passes fails", () => {
    expect(checkoutProblems({ shallow: "true", head: SHA, want: SHA })).toHaveLength(1);
    expect(checkoutProblems({ shallow: "false", head: SHA, want: "f".repeat(40) })).toHaveLength(1);
  });
});

describe("bunVersionProblems", () => {
  test("a pinned version refused for its trailing newline fails", () => {
    expect(bunVersionProblems({ running: "1.4.3", pinned: "1.4.3\n" })).toEqual([]);
  });

  test("a Bun other than the pinned one that passes fails", () => {
    expect(bunVersionProblems({ running: "1.4.4", pinned: "1.4.3\n" })).toHaveLength(1);
  });
});

describe("dependencyProblems", () => {
  test("a missing kit command, or an install that changed tracked files, that passes fails", () => {
    expect(dependencyProblems({ kitInstalled: true, diff: "" })).toEqual([]);
    expect(dependencyProblems({ kitInstalled: false, diff: "" })).toHaveLength(1);
    expect(dependencyProblems({ kitInstalled: true, diff: "diff --git a/bun.lock b/bun.lock" })).toHaveLength(1);
  });
});
