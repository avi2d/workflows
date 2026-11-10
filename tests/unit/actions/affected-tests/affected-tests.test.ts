import { describe, expect, test } from "bun:test";
import { listOf, testRuns } from "../../../../actions/affected-tests/affected-tests.ts";

describe("listOf", () => {
  test("a file list split anywhere but on whitespace, or keeping empty entries, fails", () => {
    expect(listOf(" ./tests/e2e/a.test.ts\n ./tests/e2e/b.test.ts  ")).toEqual(["./tests/e2e/a.test.ts", "./tests/e2e/b.test.ts"]);
    expect(listOf("")).toEqual([]);
  });
});

describe("testRuns", () => {
  test("a run without randomize or a worker per core, or a screen run that keeps the path ignores, fails", () => {
    expect(testRuns({ always: ["./tests/unit"], files: ["./tests/e2e/a.test.ts"], screens: ["./tests/pixel/hero.test.ts"] }, 8)).toEqual([
      ["test", "--randomize", "--parallel=8", "./tests/unit", "./tests/e2e/a.test.ts"],
      ["test", "--randomize", "--parallel=8", "--path-ignore-patterns", "", "./tests/pixel/hero.test.ts"],
    ]);
  });

  test("a screen run with no screens, which would run every test the ignores clear, fails", () => {
    expect(testRuns({ always: ["./tests/unit"], files: [], screens: [] }, 2)).toEqual([["test", "--randomize", "--parallel=2", "./tests/unit"]]);
  });

  test("a run with no paths at all, which would run the whole suite, fails", () => {
    expect(testRuns({ always: [], files: [], screens: ["./tests/pixel/a.test.ts"] }, 2)).toEqual([
      ["test", "--randomize", "--parallel=2", "--path-ignore-patterns", "", "./tests/pixel/a.test.ts"],
    ]);
  });
});
