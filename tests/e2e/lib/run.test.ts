import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useScratch } from "./scratch.ts";

const scratch = useScratch("run");

const RUN = join(import.meta.dir, "../../../lib/run.ts");

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
    runCheck(commandOutput("bash", ["-c", ${JSON.stringify(WRITES_PAST_PIPE_BUFFER)}]).pipe(Effect.map((result) => result.stdout === "out\\n" && result.passed)));
  `;
  const child = Bun.spawn(
    ["bash", "-c", 'bun -e "$PROG" 2>&1 >/dev/null | { sleep 2; wc -c; }; exit ${PIPESTATUS[0]}'],
    { stdin: "ignore", stdout: "pipe", stderr: "pipe", env: { ...process.env, PROG: program } },
  );
  const [output, exitCode] = await Promise.all([new Response(child.stdout).text(), child.exited]);
  expect(exitCode).toBe(0);
  expect(Number(output.trim())).toBe(200_000);
}, 15_000);

test("a failing child read as passed fails", () => {
  const program = `
    import { Effect } from "effect";
    import { commandOutput, runCheck } from ${JSON.stringify(RUN)};
    runCheck(commandOutput("bash", ["-c", "exit 3"]).pipe(Effect.map(({ passed }) => passed === false)));
  `;
  const { exitCode } = Bun.spawnSync(["bun", "-e", program], { stdin: "ignore" });
  expect(exitCode).toBe(0);
});

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const LEAVES_A_SESSION_CHILD_RUNNING = 'setsid sleep 300 & echo $! > "$PID_FILE"; sleep 300';

test("a command past its limit left running, or a descendant in its own session left behind, fails", () => {
  const program = `
    import { Duration, Effect } from "effect";
    import { commandPassesWithin, runCheck } from ${JSON.stringify(RUN)};
    runCheck(commandPassesWithin("bash", ["-c", ${JSON.stringify(LEAVES_A_SESSION_CHILD_RUNNING)}], Duration.seconds(1)).pipe(Effect.map((passed) => !passed)));
  `;
  const started = performance.now();
  const { exitCode } = Bun.spawnSync(["bun", "-e", program], { stdin: "ignore", env: { ...process.env, PID_FILE: scratch.at("pid") } });
  expect(exitCode).toBe(0);
  expect(performance.now() - started).toBeLessThan(10_000);
  expect(isAlive(Number(readFileSync(scratch.at("pid"), "utf8").trim()))).toBe(false);
}, 15_000);

test.each([
  ["exit 0", true],
  ["exit 3", false],
])("a command that ends within its limit with %p read other than by its exit code fails", (script, expected) => {
  const program = `
    import { Duration, Effect } from "effect";
    import { commandPassesWithin, runCheck } from ${JSON.stringify(RUN)};
    runCheck(commandPassesWithin("bash", ["-c", ${JSON.stringify(script)}], Duration.seconds(30)).pipe(Effect.map((passed) => passed === ${String(expected)})));
  `;
  const { exitCode } = Bun.spawnSync(["bun", "-e", program], { stdin: "ignore" });
  expect(exitCode).toBe(0);
});

test("a command killed by a signal within its limit that ends the check instead of reading as failed fails", () => {
  const program = `
    import { Duration, Effect } from "effect";
    import { commandPassesWithin, runCheck } from ${JSON.stringify(RUN)};
    runCheck(commandPassesWithin("bash", ["-c", "kill -KILL $$"], Duration.seconds(30)).pipe(Effect.map((passed) => passed === false)));
  `;
  const { exitCode } = Bun.spawnSync(["bun", "-e", program], { stdin: "ignore" });
  expect(exitCode).toBe(0);
});
