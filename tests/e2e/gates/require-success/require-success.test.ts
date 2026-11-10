import { expect, test } from "bun:test";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "../../../../actions/gates/require-success/main.sh");

function gate(results: string) {
  const result = Bun.spawnSync(["bash", SCRIPT], { env: { RESULTS: results } });
  return { exitCode: result.exitCode, stdout: result.stdout.toString() };
}

test("two successful jobs refused fails", () => {
  expect(gate("e2e=success pixel=success")).toEqual({ exitCode: 0, stdout: "e2e=success pixel=success\n" });
});

test.each(["e2e=success pixel=failure", "e2e=skipped pixel=success", "e2e=cancelled pixel=success", "e2e= pixel=success"])(
  "the results %p passed fails",
  (results) => {
    expect(gate(results).exitCode).toBe(1);
  },
);

test("a newline-separated failure that passes fails", () => {
  expect(gate("e2e=success\npixel=failure\n").exitCode).toBe(1);
  expect(gate("e2e=success\npixel=success\n")).toEqual({ exitCode: 0, stdout: "e2e=success pixel=success\n" });
});

test("a failure message that does not name each job that did not succeed fails", () => {
  expect(gate("e2e=failure pixel=skipped runner=success").stdout).toBe("::error::e2e=failure pixel=skipped, where each result must be success\n");
});

test("no results, which would require nothing, that passes fails", () => {
  expect(gate("  ")).toEqual({ exitCode: 1, stdout: "::error::require-success needs at least one name=result in results\n" });
});

test("a bare result without its job name that passes fails", () => {
  expect(gate("success")).toEqual({ exitCode: 1, stdout: "::error::require-success takes name=result pairs, not 'success'\n" });
});
