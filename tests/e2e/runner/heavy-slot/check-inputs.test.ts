import { expect, test } from "bun:test";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "../../../../actions/heavy-slot/main.sh");

function check(env: { ACTION: string; RUNNER_PREFIX: string; COMMAND: string }) {
  const result = Bun.spawnSync(["bash", SCRIPT], { env });
  return { exitCode: result.exitCode, stdout: result.stdout.toString() };
}

test.each(["acquire", "release"])("an action of %p with a prefix and a command that is refused fails", (action) => {
  expect(check({ ACTION: action, RUNNER_PREFIX: "heavy-", COMMAND: "heavy-slot" })).toEqual({ exitCode: 0, stdout: "" });
});

test.each(["take", "", "Acquire"])("an action of %p that passes fails", (action) => {
  expect(check({ ACTION: action, RUNNER_PREFIX: "heavy-", COMMAND: "heavy-slot" })).toEqual({
    exitCode: 1,
    stdout: `::error::action must be acquire or release, not '${action}'\n`,
  });
});

test("an empty prefix, which would match every runner, or an empty command that passes fails", () => {
  const refused = { exitCode: 1, stdout: "::error::heavy-slot needs runner-prefix and command\n" };
  expect(check({ ACTION: "acquire", RUNNER_PREFIX: "", COMMAND: "heavy-slot" })).toEqual(refused);
  expect(check({ ACTION: "acquire", RUNNER_PREFIX: "heavy-", COMMAND: "" })).toEqual(refused);
});
