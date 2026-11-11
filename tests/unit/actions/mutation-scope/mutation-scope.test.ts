import { expect, test } from "bun:test";
import { baseBranchOf, pullRequestSkip, scopesNoFile, skipNote, type PullRequest } from "../../../../actions/mutation-scope/mutation-scope.ts";

test("a pull request into release that scopes against origin/main fails", () => {
  expect(baseBranchOf("release")).toBe("origin/release");
});

test.each([undefined, ""])("a run with no pull request, base ref %p, that scopes against anything but origin/main fails", (baseRef) => {
  expect(baseBranchOf(baseRef)).toBe("origin/main");
});

const REPOSITORY = { full_name: "avi2d/checks" };

const releasePullRequest: PullRequest = {
  user: { type: "Bot" },
  head: { ref: "release/main", repo: REPOSITORY },
  base: { ref: "main", repo: REPOSITORY },
};

const dependabotPullRequest: PullRequest = {
  user: { type: "Bot" },
  head: { ref: "dependabot/npm_and_yarn/effect-4.0.1", repo: REPOSITORY },
  base: { ref: "main", repo: REPOSITORY },
};

const personPullRequest: PullRequest = {
  user: { type: "User" },
  head: { ref: "fm/some-change", repo: REPOSITORY },
  base: { ref: "main", repo: REPOSITORY },
};

test("a release pull request that is mutated, or skipped as a plain bot pull request, fails", () => {
  expect(pullRequestSkip(releasePullRequest)).toBe("release");
});

test("a release branch into a branch other than the one it is named after that is skipped as a release fails", () => {
  expect(pullRequestSkip({ ...personPullRequest, head: { ref: "release/main", repo: REPOSITORY }, base: { ref: "next", repo: REPOSITORY } })).toBeUndefined();
});

test("a fork's release/main branch that is skipped as a release fails", () => {
  expect(
    pullRequestSkip({ ...personPullRequest, head: { ref: "release/main", repo: { full_name: "someone/checks" } }, base: { ref: "main", repo: REPOSITORY } }),
  ).toBeUndefined();
});

test("a pull request from a deleted fork that fails to decide fails", () => {
  expect(pullRequestSkip({ ...personPullRequest, head: { ref: "release/main", repo: null } })).toBeUndefined();
});

test("a bot pull request that is mutated fails", () => {
  expect(pullRequestSkip(dependabotPullRequest)).toBe("bot");
});

test("a person's pull request, or a run with no pull request, that is skipped fails", () => {
  expect(pullRequestSkip(personPullRequest)).toBeUndefined();
  expect(pullRequestSkip(undefined)).toBeUndefined();
});

test.each([
  ["SCOPE=\nSTALE_TESTS=\n", true],
  ["", true],
  ["SCOPE=src/a.ts,src/b.ts\nSTALE_TESTS=\n", false],
])("a scope %p that is taken as empty when it names files, or as naming files when it is empty, fails", (lines, empty) => {
  expect(scopesNoFile(lines)).toBe(empty);
});

test("a skip note that does not name its reason as a notice fails", () => {
  expect(skipNote("release")).toBe("::notice::mutation: a release pull request changes no source, so the run does not start");
  expect(skipNote("bot")).toBe("::notice::mutation: a bot opened the pull request, so the run does not start");
  expect(skipNote("no-source")).toBe("::notice::mutation: no source files changed, so the run does not start");
});
