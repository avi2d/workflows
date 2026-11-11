import { afterEach, expect, test } from "bun:test";
import { useScratch } from "../../lib/scratch.ts";
import { actionMain, apiEnv, runAction, startStubApi, type Route, type StubApi } from "../../lib/stub-api.ts";

const MAIN = actionMain("held-runs");
const TIP = "0123456789abcdef0123456789abcdef01234567";
const REPO = "/gh/repos/owner/site";
const LIST = `${REPO}/actions/runs?head_sha=${TIP}&event=pull_request&status=action_required&per_page=100`;

const run = (id: number, owner: string) => ({
  id,
  name: "ci",
  event: "pull_request",
  conclusion: "action_required",
  head_sha: TIP,
  head_branch: "release/main",
  head_repository: { full_name: `${owner}/site` },
});

const scratch = useScratch("held-runs");
let stub: StubApi | undefined;

afterEach(async () => {
  await stub?.stop();
});

function sweep(route: Route, waitSeconds: string) {
  const started = startStubApi((method, path, body) =>
    method === "GET" && path === `${REPO}/git/ref/heads/release/main` ? { status: 200, body: { object: { sha: TIP } } } : route(method, path, body),
  );
  stub = started;
  return runAction(MAIN, [], { ...apiEnv(started, scratch.at("output")), BRANCH: "release/main", WAIT_SECONDS: waitSeconds });
}

const deletes = () => (stub?.requests ?? []).filter(({ method }) => method === "DELETE").map(({ path }) => path);

test("held-runs that leaves the release head's held run, or deletes a fork's, fails", async () => {
  let runs = [run(11, "owner"), run(12, "stranger")];
  const ran = await sweep((method, path) => {
    if (method === "GET" && path === LIST) return { status: 200, body: { workflow_runs: runs } };
    if (method === "DELETE" && path === `${REPO}/actions/runs/11`) {
      runs = runs.filter(({ id }) => id !== 11);
      return { status: 204, body: undefined };
    }
    return undefined;
  }, "30");
  expect(ran).toMatchObject({ exitCode: 0, stdout: `deleted the held ci run 11 on release/main at ${TIP}\n` });
  expect(deletes()).toEqual([`${REPO}/actions/runs/11`]);
}, 15_000);

test("held-runs that fails when nothing is held fails", async () => {
  const ran = await sweep((method, path) => (method === "GET" && path === LIST ? { status: 200, body: { workflow_runs: [] } } : undefined), "0");
  expect(ran).toMatchObject({ exitCode: 0, stdout: `found no held pull request run on release/main at ${TIP} within 0 seconds\n` });
});

test("held-runs that fails when the branch is missing fails", async () => {
  stub = startStubApi(() => undefined);
  const ran = await runAction(MAIN, [], { ...apiEnv(stub, scratch.at("output")), BRANCH: "release/main", WAIT_SECONDS: "30" });
  expect(ran).toMatchObject({ exitCode: 0, stdout: "release/main does not exist, so no run is held on it\n" });
  expect(stub.requests.map(({ path }) => path)).toEqual([`${REPO}/git/ref/heads/release/main`]);
});

test("held-runs that passes when GitHub refuses the delete fails", async () => {
  const ran = await sweep((method, path) => {
    if (method === "GET" && path === LIST) return { status: 200, body: { workflow_runs: [run(11, "owner")] } };
    if (method === "DELETE") return { status: 403, body: { message: "Resource not accessible by integration" } };
    return undefined;
  }, "30");
  expect(ran).toMatchObject({
    exitCode: 1,
    stdout: "::error::DELETE /actions/runs/11 answered HTTP 403: Resource not accessible by integration\n",
  });
});
