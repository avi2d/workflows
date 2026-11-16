import { expect, test } from "bun:test";
import { join } from "node:path";
import { at, workflowDocument, workflowSteps } from "../../lib/workflow.ts";

const PAGES = join(import.meta.dir, "../../../.github/workflows/github-pages.yml");
const document = workflowDocument(PAGES);
const build = workflowSteps(PAGES, "build");
const deploy = workflowSteps(PAGES, "deploy");

const usesOf = (step: Record<string, unknown>): string => String(step["uses"] ?? "");
const indexOf = (action: string): number => build.findIndex((step) => usesOf(step).startsWith(`actions/${action}@`));

test("a pages build that runs another command than the caller's or uploads another folder fails", () => {
  expect(at(document, "on", "workflow_call", "inputs", "build", "required")).toBe(true);
  expect(at(document, "on", "workflow_call", "inputs", "path", "required")).toBe(true);
  const command = build.findIndex((step) => step["run"] === "${{ inputs.build }}");
  expect(indexOf("configure-pages")).toBeLessThan(command);
  expect(command).toBeLessThan(indexOf("upload-pages-artifact"));
  expect(at(build[indexOf("upload-pages-artifact")], "with", "path")).toBe("${{ inputs.path }}");
});

test("a deploy that starts before the build, or without the Pages token, fails", () => {
  expect(at(document, "jobs", "deploy", "needs")).toBe("build");
  expect(at(document, "jobs", "deploy", "permissions")).toEqual({ pages: "write", "id-token": "write" });
  expect(at(document, "jobs", "deploy", "environment", "name")).toBe("github-pages");
  expect(deploy.map(usesOf).some((uses) => uses.startsWith("actions/deploy-pages@"))).toBe(true);
});

test("a deploy that cancels the one in flight fails", () => {
  expect(at(document, "concurrency", "cancel-in-progress")).toBe(false);
});
