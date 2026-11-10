import { expect, test } from "bun:test";
import { join } from "node:path";

const RUN = join(import.meta.dir, "../../../src/lib/run.ts");

// read exits 1 at end of input and above 128 when its timeout fires.
const READS_TO_END = "read -t 5 line; test $? -eq 1";

test("a child left waiting on a stdin that never closes fails", () => {
  const program = `
    import { commandPasses, runCheck } from ${JSON.stringify(RUN)};
    runCheck(commandPasses("bash", ["-c", ${JSON.stringify(READS_TO_END)}]));
  `;
  const started = performance.now();
  const { exitCode } = Bun.spawnSync(["bun", "-e", program], { stdin: "ignore" });
  expect(exitCode).toBe(0);
  expect(performance.now() - started).toBeLessThan(4000);
});

const WRITES_PAST_PIPE_BUFFER = "head -c 200000 /dev/zero | tr '\\0' x >&2; echo out";

test("a child's stderr held in an unread pipe, or kept out of the step log, fails", async () => {
  const program = `
    import { Effect } from "effect";
    import { commandOutput, runCheck } from ${JSON.stringify(RUN)};
    runCheck(commandOutput("bash", ["-c", ${JSON.stringify(WRITES_PAST_PIPE_BUFFER)}]).pipe(Effect.map(({ stdout }) => stdout === "out\\n")));
  `;
  const child = Bun.spawn(["bun", "-e", program], { stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  await Bun.sleep(2000);
  const [stderr, , exitCode] = await Promise.all([new Response(child.stderr).text(), new Response(child.stdout).text(), child.exited]);
  expect(exitCode).toBe(0);
  expect(stderr.length).toBe(200_000);
});
