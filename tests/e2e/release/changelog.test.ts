import { beforeEach, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { useScratch } from "../lib/scratch.ts";
import { runAction } from "../lib/stub-api.ts";

const SCRIPT = join(import.meta.dir, "../../../release/changelog.ts");
const URL = "https://github.com/owner/repo";
const HAND = "# Changelog\n\nEvery release, newest first.\n\n## 1.0.0\n\nReleased 2026-01-02.\n\n### Features\n\n- written by hand.\n";

const scratch = useScratch("release-changelog");

function env(): Record<string, string> {
  return {
    PATH: process.env["PATH"] ?? "",
    HOME: scratch.at(),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "seed",
    GIT_AUTHOR_EMAIL: "seed@example.com",
    GIT_COMMITTER_NAME: "seed",
    GIT_COMMITTER_EMAIL: "seed@example.com",
  };
}

function git(...args: readonly string[]): string {
  const result = Bun.spawnSync(["git", ...args], { cwd: scratch.at("repo"), env: env() });
  if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr.toString()}`);
  return result.stdout.toString().trim();
}

function manifest(version: string): void {
  scratch.write("repo/package.json", `${JSON.stringify({ name: "repo", version, repository: URL }, null, 2)}\n`);
}

function commit(subject: string): void {
  git("add", "-A");
  git("commit", "-q", "--allow-empty", "-m", subject);
}

function build() {
  return runAction(SCRIPT, [], env(), scratch.at("repo"));
}

const today = () => new Date().toISOString().slice(0, 10);

beforeEach(() => {
  mkdirSync(scratch.at("repo"));
  git("init", "-q", "-b", "main");
  manifest("1.0.0");
  scratch.write("repo/CHANGELOG.md", HAND);
  commit("feat: the first release (#1)");
  git("tag", "v1.0.0");
  commit("feat(actions): add a thing (#2)");
  commit("docs: say more (#3)");
  commit("fix(ci): bound the try (#4)");
});

test("a build on the tagged version that writes the changes since its tag into the changelog fails", async () => {
  const ran = await build();
  expect(ran.stdout).toContain("v1.0.0 is tagged, so CHANGELOG.md stays as it is");
  expect(ran.exitCode).toBe(0);
  expect(scratch.read("repo/CHANGELOG.md")).toBe(HAND);
});

test("a release build that drops the hand-written sections, lists a commit from before the last tag, or leaves out one since it fails", async () => {
  manifest("1.1.0");
  const ran = await build();
  expect(ran.exitCode).toBe(0);
  const section = [
    "## 1.1.0",
    `Released ${today()}.`,
    "### Features",
    `- **actions:** add a thing [#2](${URL}/pull/2)`,
    "### Fixes",
    `- **ci:** bound the try [#4](${URL}/pull/4)`,
    "The `v1` tag moves to this release.",
  ].join("\n\n");
  expect(scratch.read("repo/CHANGELOG.md")).toBe(HAND.replace("## 1.0.0", `${section}\n\n## 1.0.0`));
});

test("a landed release commit whose build rewrites the changelog, which the tag job refuses, fails", async () => {
  manifest("1.1.0");
  await build();
  commit("chore: release 1.1.0 (#5)");
  const written = scratch.read("repo/CHANGELOG.md");
  const ran = await build();
  expect(ran.exitCode).toBe(0);
  expect(git("status", "--porcelain")).toBe("");
  expect(scratch.read("repo/CHANGELOG.md")).toBe(written);
  git("tag", "v1.1.0");
  expect((await build()).stdout).toContain("v1.1.0 is tagged");
  expect(git("status", "--porcelain")).toBe("");
});

test("a release that merged behind main whose build leaves the changelog unchanged fails", async () => {
  manifest("1.1.0");
  await build();
  const released = scratch.read("repo/CHANGELOG.md");
  git("stash", "-q");
  commit("feat: land on main meanwhile (#6)");
  git("stash", "pop", "-q");
  scratch.write("repo/CHANGELOG.md", released);
  commit("chore: release 1.1.0 (#5)");
  await build();
  expect(git("status", "--porcelain")).toBe("M CHANGELOG.md");
  expect(scratch.read("repo/CHANGELOG.md")).toContain(`- land on main meanwhile [#6](${URL}/pull/6)`);
});

test("a version behind the last tag that overwrites a released section fails", async () => {
  git("tag", "v1.2.0");
  manifest("1.1.0");
  const ran = await build();
  expect(ran.stdout).toContain("::error::package.json holds 1.1.0, which is not past the last release tag v1.2.0");
  expect(ran.exitCode).toBe(1);
  expect(scratch.read("repo/CHANGELOG.md")).toBe(HAND);
});

test("a bump with no listed change since the last tag that writes an empty section fails", async () => {
  git("tag", "v1.0.1");
  commit("docs: only words (#7)");
  manifest("1.0.2");
  const ran = await build();
  expect(ran.stdout).toContain("::error::package.json holds 1.0.2, yet no feat, fix, perf, revert or breaking commit landed since v1.0.1");
  expect(ran.exitCode).toBe(1);
});
