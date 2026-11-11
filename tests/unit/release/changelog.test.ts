import { expect, test } from "bun:test";
import { dropStaleSections, groupOf, renderSection, withSection } from "../../../release/changelog.ts";

const URL = "https://github.com/owner/repo";

test.each<[string, string]>([
  ["feat(mutation): pick the run (#57)", "Features"],
  ["fix: bound each try", "Fixes"],
  ["perf(setup): cache the install", "Performance"],
  ['revert: "feat: add a thing"', "Reverts"],
  ["refactor(actions)!: move the actions", "Breaking changes"],
])("%s read into another group than %s fails", (subject, group) => {
  expect<string | undefined>(groupOf(subject)).toBe(group);
});

test.each([["chore: release 2.4.0 (#60)"], ["docs(changelog): name the release"], ["Merge branch main"], ["feat:missing space"]])(
  "%s listed as a change fails",
  (subject) => {
    expect(groupOf(subject)).toBeUndefined();
  },
);

test("a section out of group order, unlinked or without the major tag line fails", () => {
  const section = renderSection({
    version: "2.4.0",
    repositoryUrl: URL,
    subjects: ["fix(ci): install first (#54)", "chore: tidy", "feat(mutation): pick the run (#57)", "feat: plain feature"],
  });
  expect(section).toBe(
    [
      "## 2.4.0",
      "### Features",
      `- **mutation:** pick the run [#57](${URL}/pull/57)\n- plain feature`,
      "### Fixes",
      `- **ci:** install first [#54](${URL}/pull/54)`,
      "The `v2` tag moves to this release.",
    ].join("\n\n"),
  );
});

test("a section written from no listed change fails", () => {
  expect(renderSection({ version: "2.4.0", repositoryUrl: URL, subjects: ["chore: tidy", "docs: say more"] })).toBeUndefined();
});

const HAND = "# Changelog\n\nEvery release, newest first.\n\n## 2.3.1\n\nReleased 2026-11-11.\n\n### Fixes\n\n- by hand.\n\n## 2.3.0\n\nReleased 2026-11-10.\n\n### Features\n\n- by hand too.\n";

test("a new section put anywhere but above the last release, or one that touches a written section, fails", () => {
  const written = withSection(HAND, "2.4.0", "## 2.4.0\n\n### Fixes\n\n- new.");
  expect(written).toBe(HAND.replace("## 2.3.1", "## 2.4.0\n\n### Fixes\n\n- new.\n\n## 2.3.1"));
});

test("a section written twice, or one whose rewrite keeps the old entries, fails", () => {
  const once = withSection(HAND, "2.4.0", "## 2.4.0\n\n### Fixes\n\n- new.");
  expect(withSection(once, "2.4.0", "## 2.4.0\n\n### Fixes\n\n- new.")).toBe(once);
  const rewritten = withSection(once, "2.4.0", "## 2.4.0\n\n### Fixes\n\n- newer.");
  expect(rewritten).toBe(once.replace("- new.", "- newer."));
});

test("a section rewritten into the last place of the file that loses its final newline fails", () => {
  expect(withSection(HAND, "2.3.0", "## 2.3.0\n\n- again.")).toBe(HAND.replace("Released 2026-11-10.\n\n### Features\n\n- by hand too.", "- again."));
});

test("a section past the last tag that is not the held version stays fails", () => {
  const changelog = HAND.replace("## 2.3.1", "## 2.3.2\n\n### Fixes\n\n- never published.\n\n## 2.3.1");
  expect(dropStaleSections(changelog, "v2.3.1", "2.3.1")).toBe(HAND);
  expect(dropStaleSections(changelog, "v2.3.1", "2.4.0")).toBe(HAND);
});

test("a held or released section, or a heading with no version, dropped with the stale ones fails", () => {
  const changelog = HAND.replace("## 2.3.1", "## 2.3.2\n\n### Fixes\n\n- never published.\n\n## 2.3.1");
  expect(dropStaleSections(changelog, "v2.3.1", "2.3.2")).toBe(changelog);
  expect(dropStaleSections(changelog, undefined, "2.3.2")).toBe(changelog);
  const draft = HAND.replace("## 2.3.1", "## Unreleased\n\n- draft.\n\n## 2.3.1");
  expect(dropStaleSections(draft, "v2.3.1", "2.3.1")).toBe(draft);
});

