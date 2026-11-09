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
