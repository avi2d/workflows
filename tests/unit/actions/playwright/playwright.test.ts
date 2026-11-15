import { describe, expect, test } from "bun:test";
import { Effect, Exit } from "effect";
import { browsersOf, cacheKeyLine, holdsSystemPackages, jobKeyLine } from "../../../../actions/playwright/playwright.ts";

describe("browsersOf", () => {
  test("browsers split other than on runs of whitespace fail", () => {
    expect(Effect.runSync(browsersOf("  webkit\tchromium  firefox "))).toEqual(["webkit", "chromium", "firefox"]);
  });

  test.each(["", "   "])("browsers of %p, which name no browser, that pass fail", (input) => {
    expect(Exit.isFailure(Effect.runSyncExit(browsersOf(input)))).toBe(true);
  });
});

describe("holdsSystemPackages", () => {
  test("a dry run that reports every package installed and still counts as missing some fails", () => {
    expect(holdsSystemPackages({ stdout: "All system dependencies are installed.\n", passed: true })).toBe(true);
  });

  test("a dry run that lists missing packages and counts as holding them fails", () => {
    const stdout = "Missing system dependencies (3):\n  gstreamer1.0-plugins-base\n  libgstreamer-gl1.0-0\n  libgstreamer-plugins-base1.0-0\n";
    expect(holdsSystemPackages({ stdout, passed: false })).toBe(false);
  });

  test("an older dry run that prints the apt-get command and exits 0 and counts as holding the packages fails", () => {
    const stdout = 'sudo -- sh -c "apt-get update&& apt-get install -y --no-install-recommends libwoff1 libgtk-4-1"\n';
    expect(holdsSystemPackages({ stdout, passed: true })).toBe(false);
  });

  test("a dry run with nothing on stdout, as on a platform playwright-core has no package list for, that counts as holding the packages fails", () => {
    expect(holdsSystemPackages({ stdout: "", passed: true })).toBe(false);
  });

  test("a dry run that failed after printing the installed line and counts as holding the packages fails", () => {
    expect(holdsSystemPackages({ stdout: "All system dependencies are installed.\n", passed: false })).toBe(false);
  });
});

describe("cacheKeyLine", () => {
  test("a cache key whose browsers are joined other than by hyphens, or that spans lines, fails", () => {
    expect(cacheKeyLine(["webkit", "chromium"])).toBe("browsers=webkit-chromium\n");
  });
});

describe("jobKeyLine", () => {
  test("an empty job that changes the cache key a caller already saved under fails", () => {
    expect(jobKeyLine("")).toBe("job=\n");
    expect(jobKeyLine("  ")).toBe("job=\n");
  });

  test("a job suffix other than a hyphen and the first 16 hex digits of the job's SHA-256 fails", () => {
    expect(jobKeyLine("bunx checks-browser --pr 1")).toBe("job=-ad10dce648ab21ec\n");
  });

  test("two parallel jobs that share one cache key fail", () => {
    expect(jobKeyLine("bunx checks-test --tier=e2e 1")).not.toBe(jobKeyLine("bunx checks-browser --pr 1"));
    expect(jobKeyLine("bun run test:pixel 1")).not.toBe(jobKeyLine("bun run test:pixel 2"));
  });
});
