import { describe, expect, test } from "bun:test";
import { BunServices } from "@effect/platform-bun";
import { Effect, Exit } from "effect";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { namesOf, readSite } from "../../../../actions/site-names/site-names.ts";

const AZALIALAW = { pages: "azalialaw", domain: "azalialaw.com", production: "azalialaw/azalialaw.com" };

async function readManifest(manifest: unknown) {
  const folder = mkdtempSync(join(tmpdir(), "site-names-"));
  try {
    writeFileSync(join(folder, "package.json"), JSON.stringify(manifest));
    return await Effect.runPromiseExit(readSite(join(folder, "package.json")).pipe(Effect.provide(BunServices.layer)));
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

describe("namesOf", () => {
  test("a staging origin off the pages.dev host of the project, or a preview project other than the one azalialaw previews on, fails", () => {
    expect(namesOf(AZALIALAW)).toEqual({
      pages: "azalialaw",
      preview: "azalialaw-preview",
      domain: "azalialaw.com",
      production: "azalialaw/azalialaw.com",
      "staging-origin": "https://azalialaw.pages.dev",
      "production-origin": "https://azalialaw.com",
    });
  });
});

describe("readSite", () => {
  test("a manifest with the design's site field that is refused fails", async () => {
    const read = await readManifest({ name: "azalialaw", site: AZALIALAW });
    expect(Exit.isSuccess(read) ? read.value.production : "").toBe("azalialaw/azalialaw.com");
  });

  test("a manifest without a site field that passes, or whose message never names the field, fails", async () => {
    const read = await readManifest({ name: "website" });
    expect(Exit.isFailure(read)).toBe(true);
    expect(String(read)).toContain("site field");
  });

  test("a pages name with capitals, a domain with a scheme or a production without its owner that passes fails", async () => {
    expect(Exit.isFailure(await readManifest({ site: { ...AZALIALAW, pages: "Azalialaw" } }))).toBe(true);
    expect(Exit.isFailure(await readManifest({ site: { ...AZALIALAW, domain: "https://azalialaw.com" } }))).toBe(true);
    expect(Exit.isFailure(await readManifest({ site: { ...AZALIALAW, production: "azalialaw.com" } }))).toBe(true);
  });
});
