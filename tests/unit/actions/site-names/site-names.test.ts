import { describe, expect, test } from "bun:test";
import { Effect, Exit } from "effect";
import { namesOf, readSite } from "../../../../actions/site-names/site-names.ts";

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

  test("a preview-only site named by its project alone that is refused, or that derives a production origin, fails", async () => {
    const read = await Effect.runPromiseExit(readSite({ pages: "azalialaw", domain: "", production: "" }));
    expect(Exit.isSuccess(read) ? read.value : undefined).toEqual({
      pages: "azalialaw",
      preview: "azalialaw-preview",
      domain: "",
      production: "",
      "staging-origin": "https://azalialaw.pages.dev",
      "production-origin": "",
    });
  });

  test("an empty project name that passes fails", async () => {
    expect(Exit.isFailure(await Effect.runPromiseExit(readSite({ ...AZALIALAW, pages: "" })))).toBe(true);
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
