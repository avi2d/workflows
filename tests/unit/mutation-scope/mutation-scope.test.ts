import { expect, test } from "bun:test";
import { baseBranchOf } from "../../../src/mutation-scope/mutation-scope.ts";

test("a pull request into release that scopes against origin/main fails", () => {
  expect(baseBranchOf("release")).toBe("origin/release");
});

test.each([undefined, ""])("a run with no pull request, base ref %p, that scopes against anything but origin/main fails", (baseRef) => {
  expect(baseBranchOf(baseRef)).toBe("origin/main");
});
