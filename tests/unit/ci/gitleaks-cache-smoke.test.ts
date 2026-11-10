import { describe, expect, test } from "bun:test";
import { cacheProblem, gitleaksIn } from "../../../ci/gitleaks-cache-smoke.ts";

describe("gitleaksIn", () => {
  test("a file only named like gitleaks taken for it, or a nested gitleaks missed, fails", () => {
    expect(gitleaksIn(["8.30.0/gitleaks", "8.30.0/gitleaks.tar.gz", "not-gitleaks", "gitleaks"])).toEqual(["8.30.0/gitleaks", "gitleaks"]);
  });
});

describe("cacheProblem", () => {
  test("a cache with no gitleaks, or with one that cannot run, that passes fails", () => {
    expect(cacheProblem([])).toBeDefined();
    expect(cacheProblem([{ path: "/cache/gitleaks", executable: false }])).toBeDefined();
  });

  test("a cache with an executable gitleaks that fails fails", () => {
    expect(cacheProblem([{ path: "/cache/gitleaks", executable: true }])).toBeUndefined();
  });
});
