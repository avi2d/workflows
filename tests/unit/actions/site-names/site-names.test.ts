import { describe, expect, test } from "bun:test";
import { Effect, Exit } from "effect";
import { readSite } from "../../../../actions/site-names/site-names.ts";
import { namesOf } from "../../../../src/site-names.ts";

const AZALIALAW = { pages: "azalialaw", domain: "azalialaw.com", production: "azalialaw/azalialaw.com" };

describe("site names", () => {
  test("derived names that differ from the site's staging and production addresses fail", () => {
    expect(namesOf(AZALIALAW)).toEqual({
      pages: "azalialaw",
      preview: "azalialaw-preview",
      domain: "azalialaw.com",
      production: "azalialaw/azalialaw.com",
      "staging-origin": "https://azalialaw.pages.dev",
      "production-origin": "https://azalialaw.com",
    });
  });

  test("valid input names that are refused fail", async () => {
    const read = await Effect.runPromiseExit(readSite(AZALIALAW));
    expect(Exit.isSuccess(read) ? read.value.production : "").toBe("azalialaw/azalialaw.com");
  });

  test("invalid project, domain or repository inputs that pass fail", async () => {
    for (const input of [
      { ...AZALIALAW, pages: "Azalialaw" },
      { ...AZALIALAW, domain: "https://azalialaw.com" },
      { ...AZALIALAW, production: "azalialaw.com" },
    ]) {
      expect(Exit.isFailure(await Effect.runPromiseExit(readSite(input)))).toBe(true);
    }
  });
});
