import { describe, expect, test } from "bun:test";
import { httpsAddress, valueAt } from "../../../../src/pages/pages-staging-address/pages-staging-address.ts";

describe("valueAt", () => {
  test("a dotted export read from anywhere but its nested key fails", () => {
    expect(valueAt({ ADDRESS: { staging: "https://site.pages.dev/" } }, "ADDRESS.staging")).toBe("https://site.pages.dev/");
    expect(valueAt({ ADDRESS: "x" }, "ADDRESS.staging")).toBeUndefined();
  });
});

describe("httpsAddress", () => {
  test.each([["http://site.pages.dev/"], ["site.pages.dev"], [""], [7]])("%p taken as the staging address passes", (value) => {
    expect(httpsAddress(value)).toBeUndefined();
  });

  test("an https address refused fails", () => {
    expect(httpsAddress("https://site.pages.dev/")).toBe("https://site.pages.dev/");
  });
});
