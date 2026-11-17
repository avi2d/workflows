import { expect, test } from "bun:test";
import { chmodSync, mkdirSync, readFileSync, statSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { useScratch } from "../../lib/scratch.ts";

const SCRIPT = join(import.meta.dir, "../../../../actions/setup/self-bins.ts");
const scratch = useScratch("self-bins");

test("a kit bin that runs the installed package or changes a tracked source mode fails", () => {
  mkdirSync(scratch.at("bin"), { recursive: true });
  mkdirSync(scratch.at("node_modules", ".bin"), { recursive: true });
  scratch.write("package.json", JSON.stringify({ name: "@avi2dg/checks", bin: { "checks-fixture": "bin/source.ts" } }));
  scratch.write("bin/source.ts", 'console.log("checkout", ...process.argv.slice(2));\n');
  scratch.write("installed", 'console.log("installed");\n');
  chmodSync(scratch.at("bin", "source.ts"), 0o644);
  symlinkSync(scratch.at("installed"), scratch.at("node_modules", ".bin", "checks-fixture"));
  const setup = Bun.spawnSync(["bun", SCRIPT], { cwd: scratch.at() });
  expect(setup.exitCode).toBe(0);
  const result = Bun.spawnSync(["bunx", "--no-install", "checks-fixture", "argument"], { cwd: scratch.at() });
  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString().trim()).toBe("checkout argument");
  expect(statSync(scratch.at("bin", "source.ts")).mode & 0o777).toBe(0o644);
  expect(readFileSync(scratch.at("installed"), "utf8")).toBe('console.log("installed");\n');
});

test("a different package whose bin is replaced by setup fails", () => {
  mkdirSync(scratch.at("node_modules", ".bin"), { recursive: true });
  scratch.write("package.json", JSON.stringify({ name: "other", bin: { "checks-fixture": "source.ts" } }));
  scratch.write("node_modules/.bin/checks-fixture", "unchanged");
  expect(Bun.spawnSync(["bun", SCRIPT], { cwd: scratch.at() }).exitCode).toBe(0);
  expect(readFileSync(scratch.at("node_modules", ".bin", "checks-fixture"), "utf8")).toBe("unchanged");
});
