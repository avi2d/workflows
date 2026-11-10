import { describe, expect, test } from "bun:test";
import { faults } from "../../../src/ci/release-skeleton.ts";

const goodPr = {
  jobs: {
    tag: {
      "runs-on": "ubuntu-latest",
      if: "github.event_name == 'push' && startsWith(github.event.head_commit.message, 'chore: release ')",
      steps: [{ run: "echo tag" }],
    },
  },
};

const goodRelease = {
  jobs: {
    preflight: {
      "runs-on": "ubuntu-latest",
      steps: [{ run: "echo preflight" }],
    },
    publish: {
      "runs-on": "ubuntu-latest",
      needs: "preflight",
      steps: [
        { run: 'test "$GITHUB_REF_TYPE" = tag' },
        { run: 'git merge-base --is-ancestor "$GITHUB_SHA" origin/main' },
        { run: "${{ inputs.tree-guard-command }}" },
        { run: "${{ inputs.build-command }}" },
        { run: "${{ inputs.clean-tree-command }}" },
        { run: "${{ inputs.publish-command }}" },
      ],
    },
  },
};

describe("release skeleton", () => {
  test("a skeleton with every gate in place passes", () => {
    expect(faults(goodPr, goodRelease)).toEqual([]);
  });
  test("a tag without the release commit guard fails", () => {
    const pr = structuredClone(goodPr);
    pr.jobs.tag.if = "github.event_name == 'push'";
    expect(faults(pr, goodRelease)).toContain("tag runs off more than a release commit");
  });
  test("a publish without preflight fails", () => {
    const release = structuredClone(goodRelease);
    release.jobs.publish.needs = "setup";
    expect(faults(goodPr, release)).toContain("publish runs without preflight");
  });
  test("a publish that refuses a non-tag anywhere but first fails", () => {
    const release = structuredClone(goodRelease);
    release.jobs.publish.steps.reverse();
    expect(faults(goodPr, release)).toContain("publish refuses a non-tag anywhere but first");
  });
  test("a publish that never checks the tag sits on main fails", () => {
    const release = structuredClone(goodRelease);
    release.jobs.publish.steps = release.jobs.publish.steps.filter((step) => !step.run.includes("merge-base"));
    expect(faults(goodPr, release)).toContain("publish never checks the tag sits on main");
  });
  test("a publish that never runs the tree guard fails", () => {
    const release = structuredClone(goodRelease);
    release.jobs.publish.steps = release.jobs.publish.steps.filter((step) => !step.run.includes("tree-guard"));
    expect(faults(goodPr, release)).toContain("publish never runs the tree guard");
  });
  test("a publish that hard-codes a build or a dirty check fails", () => {
    const release = structuredClone(goodRelease);
    release.jobs.publish.steps[3] = { run: "bun run build" };
    expect(faults(goodPr, release)).toContain("publish hard-codes a build or a dirty check");
  });
  test("a publish that never runs the caller build command fails", () => {
    const release = structuredClone(goodRelease);
    release.jobs.publish.steps = release.jobs.publish.steps.filter((step) => !step.run.includes("build-command"));
    expect(faults(goodPr, release)).toContain("publish never runs the caller build command");
  });
  test("a publish that does not end in the caller publish command fails", () => {
    const release = structuredClone(goodRelease);
    release.jobs.publish.steps.push({ run: "echo done" });
    expect(faults(goodPr, release)).toContain("publish does not end in the caller publish command");
  });
  test.each([["self-hosted"], ["${{ inputs.runs-on }}"], [["self-hosted", "linux"]]])("a release job on %p that passes fails", (runsOn) => {
    const release = structuredClone(goodRelease);
    const publish: Record<string, unknown> = release.jobs.publish;
    publish["runs-on"] = runsOn;
    expect(faults(goodPr, release)).toEqual(["the publish job runs off the hosted runner"]);
  });
  test("a release pull request job without a runner that passes fails", () => {
    const pr = structuredClone(goodPr);
    const tag: Record<string, unknown> = pr.jobs.tag;
    delete tag["runs-on"];
    expect(faults(pr, goodRelease)).toEqual(["the tag job runs off the hosted runner"]);
  });
});
