import { describe, expect, test } from "bun:test";
import { packProblems } from "../../../src/ci/pack-check.ts";

const RUNNER_TEMP = "/home/runner/work/_temp";
const PACK = '{"names":["a term"]}';
const READ = "secrets: the range adds no secret\nsecrets: the kit's rules and the private pack CHECKS_SECRETS_PACK names ran\n";
const UNREAD = "secrets: the range adds no secret\nsecrets: CHECKS_SECRETS_PACK is unset, so the kit's rules ran without a private pack\n";

const written = { exported: `${RUNNER_TEMP}/secrets-pack.json`, runnerTemp: RUNNER_TEMP, pack: PACK, contents: PACK, scan: READ };

describe("packProblems", () => {
  test("a pack at RUNNER_TEMP/secrets-pack.json, unchanged and read by the scan, that reports a problem fails", () => {
    expect(packProblems(written)).toEqual([]);
  });

  test("a pack exported under another path that passes fails", () => {
    expect(packProblems({ ...written, exported: "/tmp/secrets-pack.json" })).toHaveLength(1);
  });

  test("a pack changed on the way, even by a trailing newline, that passes fails", () => {
    expect(packProblems({ ...written, contents: `${PACK}\n` })).toHaveLength(1);
  });

  test("a scan that ran without the pack that passes fails", () => {
    expect(packProblems({ ...written, scan: UNREAD })).toHaveLength(1);
  });
});
