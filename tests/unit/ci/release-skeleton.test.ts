import { describe, expect, test } from "bun:test";
import { faults } from "../../../ci/release-skeleton.ts";

const PICK = "${{ vars.CI_RUNS_ON || 'ubuntu-latest' }}";

const goodPr = {
  jobs: {
    "pull-request": {
      "runs-on": "ubuntu-latest",
      steps: [{ run: "echo plan" }],
    },
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
      "runs-on": PICK,
      steps: [{ run: "echo preflight" }],
    },
    verify: {
      "runs-on": PICK,
      needs: "preflight",
      steps: [
        { run: 'test "$GITHUB_REF_TYPE" = tag' },
        { run: 'git merge-base --is-ancestor "$GITHUB_SHA" origin/main' },
        { run: "${{ inputs.tree-guard-command }}" },
        { run: "${{ inputs.build-command }}" },
        { run: "${{ inputs.clean-tree-command }}" },
        { run: "${{ inputs.test-command }}" },
        { run: "", uses: "avi2d/workflows/actions/release-version@a1736593b253c3b6566c07241d38b2552b38ac22" },
      ],
    },
    publish: {
      "runs-on": PICK,
      needs: "verify",
      permissions: { contents: "write", "id-token": "write" },
      steps: [
        { if: "inputs.publish-command == '' && !inputs.github-release", name: "require publish-command or github-release", run: "exit 1" },
        { run: "${{ inputs.build-command }}" },
        { run: "${{ inputs.clean-tree-command }}" },
        { run: "${{ inputs.publish-command }}" },
      ],
    },
  },
};

function withoutStep<T extends { steps: { run: string }[] }>(job: T, part: string): T {
  return { ...job, steps: job.steps.filter((step) => !step.run.includes(part)) };
}

describe("release skeleton", () => {
  test("a skeleton with every gate in place that reports a fault fails", () => {
    expect(faults(goodPr, goodRelease)).toEqual([]);
  });
  test("a tag without the release commit guard that passes fails", () => {
    const pr = structuredClone(goodPr);
    pr.jobs.tag.if = "github.event_name == 'push'";
    expect(faults(pr, goodRelease)).toEqual(["tag runs off more than a release commit"]);
  });
  test("a verify without preflight that passes fails", () => {
    const release = structuredClone(goodRelease);
    release.jobs.verify.needs = "setup";
    expect(faults(goodPr, release)).toEqual(["verify runs without preflight"]);
  });
  test("a verify that refuses a non-tag anywhere but first and passes fails", () => {
    const release = structuredClone(goodRelease);
    release.jobs.verify.steps.reverse();
    expect(faults(goodPr, release)).toEqual(["verify refuses a non-tag anywhere but first"]);
  });
  test("a verify that never checks the tag sits on main and passes fails", () => {
    const release = structuredClone(goodRelease);
    release.jobs.verify = withoutStep(release.jobs.verify, "merge-base");
    expect(faults(goodPr, release)).toEqual(["verify never checks the tag sits on main"]);
  });
  test("a verify that never runs the tree guard and passes fails", () => {
    const release = structuredClone(goodRelease);
    release.jobs.verify = withoutStep(release.jobs.verify, "tree-guard");
    expect(faults(goodPr, release)).toEqual(["verify never runs the tree guard"]);
  });
  test.each([[{ "id-token": "write" }], ["write-all"]])("a verify granted %p that passes fails", (permissions) => {
    const release = structuredClone(goodRelease);
    const verify: Record<string, unknown> = release.jobs.verify;
    verify["permissions"] = permissions;
    expect(faults(goodPr, release)).toEqual(["verify holds the publish token"]);
  });
  test.each([["avi2d/workflows/actions/release-version@v2"], ["avi2d/workflows/actions/setup@a1736593b253c3b6566c07241d38b2552b38ac22"]])(
    "a verify whose tag check is %p and that passes fails",
    (action) => {
      const release = structuredClone(goodRelease);
      release.jobs.verify.steps = release.jobs.verify.steps.map((step) => ("uses" in step ? { run: "", uses: action } : step));
      expect(faults(goodPr, release)).toEqual(["verify never matches the tag to the manifest version"]);
    },
  );
  test("a verify that publishes beside its checks and passes fails", () => {
    const release = structuredClone(goodRelease);
    release.jobs.verify.steps.push({ run: "${{ inputs.publish-command }}" });
    expect(faults(goodPr, release)).toEqual(["verify publishes beside its checks"]);
  });
  test("a release with no verify job that passes fails", () => {
    const { verify: _verify, ...jobs } = structuredClone(goodRelease).jobs;
    expect(faults(goodPr, { jobs })).toContain("release has no verify job");
  });
  test("a publish that runs without verify and passes fails", () => {
    const release = structuredClone(goodRelease);
    release.jobs.publish.needs = "preflight";
    expect(faults(goodPr, release)).toEqual(["publish runs without verify"]);
  });
  test.each([["test-command"], ["lint-command"], ["typecheck-command"], ["tree-guard-command"], ["preflight-command"]])(
    "a publish that runs the caller %s beside the publish token and passes fails",
    (check) => {
      const release = structuredClone(goodRelease);
      release.jobs.publish.steps.unshift({ run: `\${{ inputs.${check} }}` });
      expect(faults(goodPr, release)).toEqual([`publish runs the caller ${check} beside the publish token`]);
    },
  );
  test("a publish that hard-codes a build and passes fails", () => {
    const release = structuredClone(goodRelease);
    release.jobs.publish.steps[1] = { run: "bun run build" };
    expect(faults(goodPr, release)).toEqual(["publish hard-codes a build or a dirty check", "publish never runs the caller build command"]);
  });
  test("a publish that never runs the caller clean tree command and passes fails", () => {
    const release = structuredClone(goodRelease);
    release.jobs.publish = withoutStep(release.jobs.publish, "clean-tree-command");
    expect(faults(goodPr, release)).toEqual(["publish never runs the caller clean tree command"]);
  });
  test("a publish with no guard against an empty publish and no GitHub release that passes fails", () => {
    const release = structuredClone(goodRelease);
    release.jobs.publish.steps = release.jobs.publish.steps.filter((step) => !String(step.if ?? "").includes("inputs.github-release"));
    expect(faults(goodPr, release)).toEqual(["publish passes with no publish command and no GitHub release"]);
  });
  test("a publish whose no-op guard runs for a caller that passes only one output and passes fails", () => {
    const release = structuredClone(goodRelease);
    const guard = release.jobs.publish.steps[0] as Record<string, unknown>;
    guard["if"] = "inputs.publish-command == '' || !inputs.github-release";
    expect(faults(goodPr, release)).toEqual(["publish passes with no publish command and no GitHub release"]);
  });
  test("a publish that never runs the caller publish command and passes fails", () => {
    const release = structuredClone(goodRelease);
    release.jobs.publish = withoutStep(release.jobs.publish, "inputs.publish-command");
    expect(faults(goodPr, release)).toEqual(["publish never runs the caller publish command"]);
  });
  test("a publish that runs a step after the caller publish command for every caller and passes fails", () => {
    const release = structuredClone(goodRelease);
    release.jobs.publish.steps.push({ run: "echo done" });
    expect(faults(goodPr, release)).toEqual(["publish runs a step after the caller publish command that the GitHub release does not gate"]);
  });
  test("a publish whose GitHub release steps after the publish command are gated on the opt-in that reports a fault fails", () => {
    const release = structuredClone(goodRelease);
    const publish: { steps: Record<string, string>[] } = release.jobs.publish;
    publish.steps.push({ if: "inputs.github-release", uses: "avi2d/workflows/actions/kit-bin@3dc7515f3ccf65e333eba3c8a9b358533d081430" });
    publish.steps.push({ if: "inputs.github-release", run: 'gh release create "$GITHUB_REF_NAME"' });
    expect(faults(goodPr, release)).toEqual([]);
  });
  test.each([["ubuntu-latest"], ["self-hosted"], ["${{ inputs.runs-on }}"], ["${{ vars.CI_RUNS_ON || 'self-hosted' }}"], [["self-hosted", "linux"]]])(
    "a release job on %p in place of the caller's runner pick that passes fails",
    (runsOn) => {
    const release = structuredClone(goodRelease);
    const publish: Record<string, unknown> = release.jobs.publish;
    publish["runs-on"] = runsOn;
    expect(faults(goodPr, release)).toEqual(["the publish job runs off the caller's runner pick"]);
    },
  );
  test("a release pull request job without a runner that passes fails", () => {
    const pr = structuredClone(goodPr);
    const tag: Record<string, unknown> = pr.jobs.tag;
    delete tag["runs-on"];
    expect(faults(pr, goodRelease)).toEqual(["the tag job runs off the hosted runner"]);
  });
  test.each([[PICK], ["self-hosted"]])("a release pull request job on %p in place of the hosted runner that passes fails", (runsOn) => {
    const pr = structuredClone(goodPr);
    const tag: Record<string, unknown> = pr.jobs.tag;
    tag["runs-on"] = runsOn;
    expect(faults(pr, goodRelease)).toEqual(["the tag job runs off the hosted runner"]);
  });
});
