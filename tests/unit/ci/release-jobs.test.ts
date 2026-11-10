import { describe, expect, test } from "bun:test";
import { releaseJobProblems } from "../../../ci/release-jobs.ts";

const PLANNED = { name: "release-pr / pull-request", conclusion: "success" };
const UNTAGGED = { name: "release-pr / tag", conclusion: "skipped" };

describe("releaseJobProblems", () => {
  test("a run that planned and skipped the tag that reports a problem fails", () => {
    expect(releaseJobProblems([{ name: "static", conclusion: "success" }, PLANNED, UNTAGGED])).toEqual([]);
  });

  test("a plan that failed and still passes fails", () => {
    expect(releaseJobProblems([{ ...PLANNED, conclusion: "failure" }, UNTAGGED])).toEqual([
      "the pull-request job is failure, where success was wanted",
    ]);
  });

  test("a tag that ran on a pull request and still passes fails", () => {
    expect(releaseJobProblems([PLANNED, { ...UNTAGGED, conclusion: "success" }])).toEqual([
      "the tag job is success, where skipped was wanted",
    ]);
  });

  test("a run missing the release jobs that passes fails", () => {
    expect(releaseJobProblems([{ name: "static", conclusion: "success" }])).toHaveLength(2);
  });

  test("a job named only like the release job taken as it fails", () => {
    expect(releaseJobProblems([{ name: "pre-tag", conclusion: "skipped" }, PLANNED])).toEqual([
      "the tag job is missing, where skipped was wanted",
    ]);
  });
});
