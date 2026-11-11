import { expect, test } from "bun:test";
import { join } from "node:path";
import { useScratch } from "../../lib/scratch.ts";
import { runAction } from "../../lib/stub-api.ts";
import { recordedCalls, stubBin } from "../../lib/stub-bin.ts";

const scratch = useScratch("playwright");
const MAIN = join(import.meta.dir, "../../../../actions/playwright/main.ts");
const DRY_RUN = ["playwright-core", "install-deps", "--dry-run", "webkit", "chromium"];
const INSTALL = ["playwright-core", "install-deps", "webkit", "chromium"];
const BUNX_ANSWERS_THE_DRY_RUN = `case " $* " in *" --dry-run "*) printf '%s\\n' "$DRY_RUN_STDOUT"; exit "$DRY_RUN_EXIT" ;; esac`;

function installDeps(dryRun: { readonly stdout: string; readonly exitCode: number }) {
  stubBin(scratch.at("bin"), "bunx", BUNX_ANSWERS_THE_DRY_RUN);
  return runAction(MAIN, ["install-deps"], {
    PATH: `${scratch.at("bin")}:${process.env["PATH"] ?? ""}`,
    STUB_RECORD: scratch.at("calls"),
    BROWSERS: "webkit chromium",
    DRY_RUN_STDOUT: dryRun.stdout,
    DRY_RUN_EXIT: String(dryRun.exitCode),
  });
}

test("a machine that holds every system package and still has apt-get run fails", async () => {
  const ran = await installDeps({ stdout: "All system dependencies are installed.", exitCode: 0 });
  expect(ran.exitCode).toBe(0);
  expect(recordedCalls(scratch.at("calls"))).toEqual([DRY_RUN]);
});

test("a machine that misses system packages and gets none installed fails", async () => {
  const ran = await installDeps({ stdout: "Missing system dependencies (1):\n  libwoff1", exitCode: 1 });
  expect(ran.exitCode).toBe(0);
  expect(recordedCalls(scratch.at("calls"))).toEqual([DRY_RUN, INSTALL]);
});
