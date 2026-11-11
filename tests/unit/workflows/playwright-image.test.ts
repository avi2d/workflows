import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isRecord } from "../../lib/workflow.ts";

const ROOT = join(import.meta.dir, "../../..");

function at(document: unknown, ...keys: readonly string[]): unknown {
  return keys.reduce<unknown>((value, key) => (isRecord(value) ? value[key] : undefined), document);
}

function pinnedPlaywrightCore(): string {
  const manifest: unknown = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  return String(at(manifest, "devDependencies", "playwright-core"));
}

function playwrightJobImage(): string {
  const workflow: unknown = Bun.YAML.parse(readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8"));
  return String(at(workflow, "jobs", "playwright", "container"));
}

test("a playwright job in an image built for another playwright-core than package.json pins, or in one not pinned by digest, fails", () => {
  const image = playwrightJobImage();
  expect(image).toStartWith(`mcr.microsoft.com/playwright:v${pinnedPlaywrightCore()}-`);
  expect(image).toMatch(/^[^@]+-[a-z]+@sha256:[0-9a-f]{64}$/);
});
