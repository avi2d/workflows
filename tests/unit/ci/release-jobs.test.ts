import { describe, expect, test } from "bun:test";
import { releaseJobProblems } from "../../../ci/release-jobs.ts";

const HOSTED = ["ubuntu-latest"];
const PLANNED = { name: "release-pr / pull-request", conclusion: "success", labels: HOSTED };
const UNTAGGED = { name: "release-pr / tag", conclusion: "skipped", labels: HOSTED };

describe("releaseJobProblems", () => {
  test("a run that planned and skipped the tag that reports a problem fails", () => {
    expect(releaseJobProblems([{ name: "static", conclusion: "success", labels: HOSTED }, PLANNED, UNTAGGED])).toEqual([]);
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
    expect(releaseJobProblems([{ name: "static", conclusion: "success", labels: HOSTED }])).toHaveLength(2);
  });

  test("a job named only like the release job taken as it fails", () => {
    expect(releaseJobProblems([{ name: "pre-tag", conclusion: "skipped", labels: HOSTED }, PLANNED])).toEqual([
      "the tag job is missing, where skipped was wanted",
    ]);
  });

  test.each([[["self-hosted", "linux"]], [["ubuntu-22.04"]]])("a plan that left the hosted runner for %p with no CI_RUNS_ON set and passes fails", (labels) => {
    expect(releaseJobProblems([{ ...PLANNED, labels }, UNTAGGED])).toEqual([
      `the pull-request job ran on [${labels.join(", ")}], where ubuntu-latest was wanted`,
    ]);
  });
});
