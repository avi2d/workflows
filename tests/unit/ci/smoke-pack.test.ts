import { BunServices } from "@effect/platform-bun";
import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SMOKE_TERM, writeSmokePack } from "../../../src/ci/smoke-pack.ts";

const UNSPELLED_TERM = ["smoke", "pack", "term"].join("-");

async function outputAfterWrite() {
  const githubOutput = join(await mkdtemp(join(tmpdir(), "smoke-pack-")), "github-output");
  await writeFile(githubOutput, "earlier=kept\n");
  await Effect.runPromise(writeSmokePack(githubOutput).pipe(Effect.provide(BunServices.layer)));
  return (await readFile(githubOutput, "utf8")).split("\n");
}

describe("writeSmokePack", () => {
  test("an output that drops earlier lines or spans more than one name=value line fails", async () => {
    const [earlier, written, end, ...rest] = await outputAfterWrite();
    expect(earlier).toBe("earlier=kept");
    expect(written?.startsWith("json=")).toBe(true);
    expect(end).toBe("");
    expect(rest).toEqual([]);
  });

  test("a json output that is not a pack of the one smoke term fails", async () => {
    const [, written = ""] = await outputAfterWrite();
    expect(JSON.parse(written.slice("json=".length))).toEqual({ names: [UNSPELLED_TERM] });
    expect(SMOKE_TERM).toBe(UNSPELLED_TERM);
  });
});
