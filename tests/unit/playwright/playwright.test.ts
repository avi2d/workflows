import { describe, expect, test } from "bun:test";
import { Effect, Exit } from "effect";
import { browsersOf, cacheKeyLine } from "../../../src/playwright/playwright.ts";

describe("browsersOf", () => {
  test("browsers split other than on runs of whitespace fail", () => {
    expect(Effect.runSync(browsersOf("  webkit\tchromium  firefox "))).toEqual(["webkit", "chromium", "firefox"]);
  });

  test.each(["", "   "])("browsers of %p, which name no browser, that pass fail", (input) => {
    expect(Exit.isFailure(Effect.runSyncExit(browsersOf(input)))).toBe(true);
  });
});

describe("cacheKeyLine", () => {
  test("a cache key whose browsers are joined other than by hyphens, or that spans lines, fails", () => {
    expect(cacheKeyLine(["webkit", "chromium"])).toBe("browsers=webkit-chromium\n");
  });
});
