import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import { useScratch } from "../lib/scratch.ts";
import { runAction, startStubApi, type StubApi } from "../lib/stub-api.ts";

const SCRIPT = join(import.meta.dir, "../../../release/major-tag.ts");
const OLD = "1111111111111111111111111111111111111111";
const NEW = "2222222222222222222222222222222222222222";

const scratch = useScratch("release-major-tag");
let stub: StubApi | undefined;

afterEach(async () => {
  await stub?.stop();
});

function refs(...tags: readonly (readonly [string, string])[]) {
  return tags.map(([name, sha]) => ({ ref: `refs/tags/${name}`, object: { sha, type: "commit" } }));
}

function serve(listed: unknown): StubApi {
  stub = startStubApi((method, path) => {
    if (method === "GET" && path === "/gh/repos/owner/workflows/git/matching-refs/tags/v2") return { status: 200, body: listed };
    if (method === "PATCH" && path === "/gh/repos/owner/workflows/git/refs/tags/v2") return { status: 200, body: { ref: "refs/tags/v2", object: { sha: NEW } } };
    if (method === "POST" && path === "/gh/repos/owner/workflows/git/refs") return { status: 201, body: { ref: "refs/tags/v2", object: { sha: NEW } } };
    return undefined;
  });
  return stub;
}

function publish(api: StubApi, overrides: Readonly<Record<string, string>> = {}) {
  return runAction(SCRIPT, [], {
    PATH: process.env["PATH"] ?? "",
    GITHUB_API_URL: `${api.base}/gh`,
    GITHUB_REPOSITORY: "owner/workflows",
    GH_TOKEN: "gh-token-value",
    GITHUB_REF_TYPE: "tag",
    GITHUB_REF_NAME: "v2.4.0",
    GITHUB_SHA: NEW,
    GITHUB_OUTPUT: scratch.at("output"),
    ...overrides,
  });
}

test("a publish that leaves v2 on the last release, or moves it without the token or force, fails", async () => {
  const api = serve(refs(["v2", OLD], ["v2.3.1", OLD], ["v2.4.0", NEW]));
  const ran = await publish(api);
  expect(ran.stdout).toContain("major-tag: moved v2 from 111111111111 to v2.4.0 at 222222222222");
  expect(ran.exitCode).toBe(0);
  expect(api.requests.map(({ method, path, body }) => [method, path, body])).toEqual([
    ["GET", "/gh/repos/owner/workflows/git/matching-refs/tags/v2", undefined],
    ["PATCH", "/gh/repos/owner/workflows/git/refs/tags/v2", { sha: NEW, force: true }],
  ]);
  expect(api.requests.every(({ authorization }) => authorization === "Bearer gh-token-value")).toBe(true);
});

test("a first release of the major that patches a v2 that does not exist fails", async () => {
  const api = serve(refs(["v2.4.0", NEW]));
  const ran = await publish(api);
  expect(ran.exitCode).toBe(0);
  expect(api.requests.at(-1)).toMatchObject({ method: "POST", path: "/gh/repos/owner/workflows/git/refs", body: { ref: "refs/tags/v2", sha: NEW } });
});

test("an older release published again that moves v2 back fails", async () => {
  const api = serve(refs(["v2", OLD], ["v2.4.0", NEW], ["v2.5.0", OLD]));
  const ran = await publish(api);
  expect(ran.stdout).toContain("major-tag: v2.4.0 is behind v2.5.0, so v2 stays on v2.5.0");
  expect(ran.exitCode).toBe(0);
  expect(api.requests.map(({ method }) => method)).toEqual(["GET"]);
});

test.each([
  ["a branch run", { GITHUB_REF_TYPE: "branch", GITHUB_REF_NAME: "main" }],
  ["the moving tag itself", { GITHUB_REF_NAME: "v2" }],
])("%s that moves the major tag fails", async (_, overrides) => {
  const api = serve(refs(["v2", OLD]));
  const ran = await publish(api, overrides);
  expect(ran.stdout).toContain("::error::major-tag runs only on a vMAJOR.MINOR.PATCH tag");
  expect(ran.exitCode).toBe(1);
  expect(api.requests).toEqual([]);
});

test("a move GitHub refuses that passes fails", async () => {
  stub = startStubApi((method) => (method === "GET" ? { status: 200, body: refs(["v2", OLD], ["v2.4.0", NEW]) } : { status: 422, body: { message: "Reference update failed" } }));
  const ran = await publish(stub);
  expect(ran.stdout).toContain("::error::PATCH /git/refs/tags/v2 answered HTTP 422: Reference update failed");
  expect(ran.exitCode).toBe(1);
});
