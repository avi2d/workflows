import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { failedParts, resultsOf } from "../../../src/ci/require-parts.ts";

const PARTS = ["static", "setup", "gitleaks-cache-fill", "gitleaks-cache", "docs-only", "head-status", "playwright", "heavy-slot", "kit-bin"];

function needsWith(overrides: Record<string, string>): string {
  return JSON.stringify(Object.fromEntries(PARTS.map((part) => [part, { result: overrides[part] ?? "success", outputs: {} }])));
}

function failedFor(overrides: Record<string, string>, event: string): string[] {
  return failedParts(Effect.runSync(resultsOf(needsWith(overrides))), event);
}

describe("failedParts", () => {
  test("every part passing on a pull request that fails the checks job fails", () => {
    expect(failedFor({}, "pull_request")).toEqual([]);
  });

  test.each(PARTS)("a %s that failed and still passes the checks job fails", (part) => {
    expect(failedFor({ [part]: "failure" }, "workflow_dispatch")).toEqual([`${part}=failure`]);
  });

  test.each(["cancelled", "skipped"])("a part %s on a pull request that passes the checks job fails", (result) => {
    expect(failedFor({ "kit-bin": result }, "pull_request")).toEqual([`kit-bin=${result}`]);
  });

  test("a head-status skipped on a pull request that passes the checks job fails", () => {
    expect(failedFor({ "head-status": "skipped" }, "pull_request")).toEqual(["head-status=skipped"]);
  });

  test("a head-status skipped on a dispatch that fails the checks job fails", () => {
    expect(failedFor({ "head-status": "skipped" }, "workflow_dispatch")).toEqual([]);
  });

  test("a part other than head-status skipped on a dispatch that passes the checks job fails", () => {
    expect(failedFor({ static: "skipped" }, "workflow_dispatch")).toEqual(["static=skipped"]);
  });
});

describe("resultsOf", () => {
  test.each(["", "{}", "[]", "not json"])("a NEEDS of %p that requires no part and passes fails", (needs) => {
    expect(Effect.runSync(Effect.flip(resultsOf(needs))).message).toStartWith("require-parts ");
  });
});
