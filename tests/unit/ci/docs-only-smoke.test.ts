import { describe, expect, test } from "bun:test";
import { commitsLines, readingProblems } from "../../../ci/docs-only-smoke.ts";

describe("readingProblems", () => {
  test("the readings docs-only gives a README change, a code change and an empty base that report a problem fail", () => {
    expect(readingProblems({ docs: "true", code: "false", none: "false" })).toEqual([]);
  });

  test.each([
    { docs: "false", code: "false", none: "false" },
    { docs: "true", code: "true", none: "false" },
    { docs: "true", code: "false", none: "true" },
    { docs: "", code: "false", none: "false" },
  ])("a wrong reading %p that passes fails", (readings) => {
    expect(readingProblems(readings)).toHaveLength(1);
  });
});

describe("commitsLines", () => {
  test("outputs other than one name=value line per commit fail", () => {
    expect(commitsLines({ base: "a", docs: "b", code: "c" })).toBe("base=a\ndocs=b\ncode=c\n");
  });
});
