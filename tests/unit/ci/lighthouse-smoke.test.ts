import { describe, expect, test } from "bun:test";
import { EXPECTED_REPORTS, smokeFailures } from "../../../ci/lighthouse-smoke.ts";
import type { Scores } from "../../../actions/lighthouse/scores.ts";

const clean: Scores = { performance: 100, accessibility: 100, "best-practices": 96, seo: 100 };
const faulty: Scores = { performance: 100, accessibility: 39, "best-practices": 96, seo: 82 };

function reportsOf(overrides: Readonly<Record<string, Scores | undefined>> = {}): Map<string, Scores | undefined> {
  const reports = new Map<string, Scores | undefined>(EXPECTED_REPORTS.map((name) => [name, name.includes("faults") ? faulty : clean]));
  for (const [name, scores] of Object.entries(overrides)) reports.set(name, scores);
  return reports;
}

describe("smokeFailures", () => {
  test("a successful action with every report scored and a low accessibility score passed that is refused fails", () => {
    expect(smokeFailures({ outcome: "success", reports: reportsOf() })).toEqual([]);
  });

  test("an action that failed on its scores and still passes the smoke fails", () => {
    expect(smokeFailures({ outcome: "failure", reports: reportsOf() })).toEqual(["the action ended in failure, though no score may fail it"]);
  });

  test("a missing run report that passes fails", () => {
    const reports = reportsOf();
    reports.delete("01-index-run-2.json");
    expect(smokeFailures({ outcome: "success", reports })).toEqual(["no report 01-index-run-2.json"]);
  });

  test("a report without one of the four scores, or not a report at all, that passes fails", () => {
    const failures = smokeFailures({
      outcome: "success",
      reports: reportsOf({ "01-index-run-1.json": { ...clean, seo: null }, "01-index-run-2.json": undefined }),
    });
    expect(failures).toEqual(["01-index-run-1.json has no seo score", "01-index-run-2.json is not a Lighthouse report"]);
  });

  test("a faults page that scores full accessibility, so no low score was seen to pass, that passes fails", () => {
    const failures = smokeFailures({ outcome: "success", reports: reportsOf({ "02-faults-run-1.json": clean }) });
    expect(failures).toEqual(["the faults page scored accessibility 100, so no low score was seen to pass"]);
  });

  test("a report for a page or run nobody asked for that passes fails", () => {
    expect(smokeFailures({ outcome: "success", reports: reportsOf({ "03-other-run-1.json": clean }) })).toEqual(["unexpected report 03-other-run-1.json"]);
  });
});
