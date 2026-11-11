import { expect, test } from "bun:test";
import { majorMove } from "../../../release/major-tag.ts";

const OLD = "1111111111111111111111111111111111111111";
const NEW = "2222222222222222222222222222222222222222";

const tags = [
  { name: "v2", sha: OLD },
  { name: "v2.3.1", sha: OLD },
  { name: "v2.3.0", sha: "3333333333333333333333333333333333333333" },
];

test("a newest release that leaves the major tag behind fails", () => {
  expect(majorMove([...tags, { name: "v2.4.0", sha: NEW }], "v2.4.0", NEW, "v2")).toEqual({ kind: "update", major: "v2", from: OLD });
});

test("v2.10.0 read as older than v2.9.0, as a text order reads it, fails", () => {
  const listed = [...tags, { name: "v2.9.0", sha: OLD }, { name: "v2.10.0", sha: NEW }];
  expect(majorMove(listed, "v2.10.0", NEW, "v2")).toEqual({ kind: "update", major: "v2", from: OLD });
});

test("an older release published again that moves the major tag back fails", () => {
  expect(majorMove(tags, "v2.3.0", "3333333333333333333333333333333333333333", "v2")).toEqual({ kind: "behind", major: "v2", newest: "v2.3.1" });
});

test("a tag of another major, such as v20, counted as a newer v2 release fails", () => {
  const listed = [...tags, { name: "v2.4.0", sha: NEW }, { name: "v20.0.0", sha: "4444444444444444444444444444444444444444" }];
  expect(majorMove(listed, "v2.4.0", NEW, "v2")).toEqual({ kind: "update", major: "v2", from: OLD });
});

test("a major tag already on the release that is written again fails", () => {
  expect(majorMove(tags, "v2.3.1", OLD, "v2")).toEqual({ kind: "current", major: "v2" });
});

test("the first release of a major that updates a tag that does not exist fails", () => {
  expect(majorMove([...tags, { name: "v3.0.0", sha: NEW }], "v3.0.0", NEW, "v3")).toEqual({ kind: "create", major: "v3" });
});
