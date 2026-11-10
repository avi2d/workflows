import { expect, test } from "bun:test";
import { tagFor } from "../../../../actions/release-version/release-version.ts";

test("a version tagged without the v, or with the version changed, fails", () => {
  expect(tagFor("1.2.3")).toBe("v1.2.3");
  expect(tagFor("2.0.0-rc.1")).toBe("v2.0.0-rc.1");
});
