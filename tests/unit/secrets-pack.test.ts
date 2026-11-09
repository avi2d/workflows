import { BunServices } from "@effect/platform-bun";
import { describe, expect, test } from "bun:test";
import { Effect, Exit } from "effect";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writePack } from "../../secrets-pack/write.ts";

const PACK = '{\n  "names": ["Example Person"],\n  "domains": ["example.test"]\n}';

async function runner() {
  const runnerTemp = await mkdtemp(join(tmpdir(), "secrets-pack-"));
  const githubEnv = join(runnerTemp, "github-env");
  await writeFile(githubEnv, "EARLIER=kept\n");
  return { runnerTemp, githubEnv };
}

const run = (pack: string, paths: { runnerTemp: string; githubEnv: string }) =>
  Effect.runPromiseExit(writePack({ pack, ...paths }).pipe(Effect.provide(BunServices.layer)));

describe("writePack", () => {
  test("a pack written with a trailing newline or anywhere but RUNNER_TEMP/secrets-pack.json fails", async () => {
    const paths = await runner();
    expect(Exit.isSuccess(await run(PACK, paths))).toBe(true);
    expect(await readFile(join(paths.runnerTemp, "secrets-pack.json"), "utf8")).toBe(PACK);
  });

  test("an export that drops earlier GITHUB_ENV lines or names another path fails", async () => {
    const paths = await runner();
    await run(PACK, paths);
    expect(await readFile(paths.githubEnv, "utf8")).toBe(`EARLIER=kept\nCHECKS_SECRETS_PACK=${join(paths.runnerTemp, "secrets-pack.json")}\n`);
  });

  test("an empty pack that passes or writes a file fails", async () => {
    const paths = await runner();
    expect(Exit.isFailure(await run("", paths))).toBe(true);
    expect((await readdir(paths.runnerTemp)).sort()).toEqual(["github-env"]);
    expect(await readFile(paths.githubEnv, "utf8")).toBe("EARLIER=kept\n");
  });
});
