import { beforeEach, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { useScratch } from "../../lib/scratch.ts";
import { runAction } from "../../lib/stub-api.ts";

const MAIN = join(import.meta.dir, "../../../../actions/pages-staging-address/main.ts");

const scratch = useScratch("read-staging-address");

beforeEach(() => {
  mkdirSync(scratch.at("src/lib"), { recursive: true });
});

function read(address: string) {
  scratch.write("src/address.ts", `export const ADDRESS = { staging: ${JSON.stringify(address)} };\n`);
  return runAction(MAIN, [], { PATH: process.env["PATH"] ?? "", GITHUB_OUTPUT: scratch.at("output"), MODULE: "src/address.ts", EXPORT: "ADDRESS.staging" }, scratch.at());
}

test("an address read from outside the working directory's module fails", async () => {
  const ran = await read("https://site-staging.pages.dev/");
  expect(ran.exitCode).toBe(0);
  expect(scratch.read("output")).toBe("address=https://site-staging.pages.dev/\n");
});

test("a plain http address written as the staging address passes", async () => {
  const ran = await read("http://site-staging.pages.dev/");
  expect(ran.exitCode).toBe(1);
  expect(ran.stdout).toContain('::error::src/address.ts exports ADDRESS.staging as "http://site-staging.pages.dev/", where an https address was wanted');
  expect(scratch.read("output")).toBe("");
});
