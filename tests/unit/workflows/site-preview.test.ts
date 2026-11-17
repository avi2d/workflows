import { expect, test } from "bun:test";
import { join } from "node:path";
import { namesOf } from "../../../actions/site-names/site-names.ts";
import { at, isRecord, needsOf, workflowDocument, workflowSteps } from "../../lib/workflow.ts";

const WORKFLOW = join(import.meta.dir, "../../../.github/workflows/site-preview.yml");
const document = workflowDocument(WORKFLOW);
const job = (name: string) => at(document, "jobs", name);
const usesOf = (step: Record<string, unknown>) => String(step["uses"] ?? "");

test("the build job cannot read Cloudflare secrets", () => {
  const build = job("build");
  expect(isRecord(build)).toBe(true);
  expect(JSON.stringify(build)).not.toMatch(/secrets\s*\./i);
  expect(at(build, "permissions", "contents")).toBe("read");
  expect(at(build, "permissions", "pull-requests")).toBeUndefined();
});

test("the address job cannot check out or run pull request code", () => {
  const steps = workflowSteps(WORKFLOW, "address");
  expect(steps).toHaveLength(3);
  expect(steps.every((step) => !("run" in step))).toBe(true);
  expect(steps.map(usesOf)).toEqual([
    "avi2d/workflows/actions/preview-secrets-check@v3",
    "oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6",
    "avi2d/workflows/actions/preview-address@v3",
  ]);
});

test("the deploy job cannot check out or run pull request code", () => {
  const deploy = job("deploy");
  expect(isRecord(deploy)).toBe(true);
  if (!isRecord(deploy)) throw new Error("deploy job is missing");
  expect(needsOf(deploy)).toContain("build");
  expect(workflowSteps(WORKFLOW, "deploy").map(usesOf)).toEqual([
    "oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6",
    "actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333",
    "avi2d/workflows/actions/preview-deploy@v3",
    "avi2d/workflows/actions/preview-comment@v3",
  ]);
  expect(workflowSteps(WORKFLOW, "deploy").every((step) => !("run" in step))).toBe(true);
});

test("the preview project expression cannot diverge from site-names", () => {
  const address = workflowSteps(WORKFLOW, "address").find((step) => usesOf(step).startsWith("avi2d/workflows/actions/preview-address@"));
  const deploy = workflowSteps(WORKFLOW, "deploy").find((step) => usesOf(step).startsWith("avi2d/workflows/actions/preview-deploy@"));
  const expression = at(address, "with", "project");
  expect(expression).toBe(at(deploy, "with", "project"));
  expect(typeof expression).toBe("string");
  if (typeof expression !== "string") throw new Error("preview project expression is missing");
  const match = /^\$\{\{\s*format\('([^']+)',\s*inputs\.pages\)\s*\}\}$/.exec(expression);
  expect(match).not.toBeNull();
  if (!match) throw new Error("preview project is not a format expression");
  for (const pages of ["site", "example-site", "a"]) {
    expect(match[1]?.replace("{0}", pages)).toBe(namesOf({ pages, domain: "", production: "" }).preview);
  }
});
