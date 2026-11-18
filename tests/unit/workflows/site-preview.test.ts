import { expect, test } from "bun:test";
import { join } from "node:path";
import { at, isRecord, needsOf, workflowDocument, workflowSteps } from "../../lib/workflow.ts";

const WORKFLOW = join(import.meta.dir, "../../../.github/workflows/site-preview.yml");
const REMOVE_WORKFLOW = join(import.meta.dir, "../../../.github/workflows/preview-remove.yml");
const SETUP_BUN = join(import.meta.dir, "../../../actions/setup-bun/action.yml");
const document = workflowDocument(WORKFLOW);
const job = (name: string) => at(document, "jobs", name);
const usesOf = (step: Record<string, unknown>) => String(step["uses"] ?? "");

const stringsOf = (value: unknown): readonly string[] => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsOf);
  if (isRecord(value)) return Object.values(value).flatMap(stringsOf);
  return [];
};

const expressionsOf = (value: unknown): readonly string[] =>
  stringsOf(value).flatMap((text) => {
    const found: string[] = [];
    const pattern = /[$][{][{]([\s\S]*?)[}][}]/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) found.push(match[1] ?? "");
    return found;
  });

const readsSecretsContext = (expression: string): boolean => {
  const code = expression.replace(/'[^']*'|"[^"]*"/g, "");
  return /\bsecrets\b/.test(code);
};

const stepUsing = (jobName: string, prefix: string): Record<string, unknown> => {
  const step = workflowSteps(WORKFLOW, jobName).find((candidate) => usesOf(candidate).startsWith(prefix));
  expect(step).toBeDefined();
  if (!step) throw new Error(prefix + " step is missing from " + jobName);
  return step;
};

test("the build job cannot read Cloudflare secrets", () => {
  const build = job("build");
  expect(isRecord(build)).toBe(true);
  if (!isRecord(build)) throw new Error("build job is missing");
  expect(expressionsOf(build).filter(readsSecretsContext)).toEqual([]);
  expect(at(build, "permissions", "contents")).toBe("read");
  expect(at(build, "permissions", "pull-requests")).toBeUndefined();
});

const expectIsolatedJob = (workflow: string, jobName: string): void => {
  const steps = workflowSteps(workflow, jobName);
  expect(steps.length).toBeGreaterThan(0);
  expect(steps.every((step) => !("run" in step))).toBe(true);
  expect(steps.some((step) => usesOf(step).startsWith("actions/checkout@"))).toBe(false);
  expect(steps.some((step) => usesOf(step).startsWith("avi2d/workflows/actions/setup@"))).toBe(false);
  expect(steps.some((step) => usesOf(step).startsWith("oven-sh/setup-bun@"))).toBe(false);
  expect(steps.some((step) => usesOf(step).startsWith("avi2d/workflows/actions/setup-bun@"))).toBe(true);
};

test("the address job cannot check out or run pull request code", () => {
  expectIsolatedJob(WORKFLOW, "address");
});

test("the setup-bun wrapper disables the shared cache", () => {
  const runs = at(workflowDocument(SETUP_BUN), "runs");
  const listed: unknown[] = isRecord(runs) && Array.isArray(runs["steps"]) ? runs["steps"] : [];
  expect(listed.length).toBeGreaterThan(0);
  const bunSteps = listed.filter((step) => isRecord(step) && usesOf(step).startsWith("oven-sh/setup-bun@"));
  expect(bunSteps.length).toBeGreaterThan(0);
  for (const step of bunSteps) expect(String(at(step, "with", "no-cache"))).toBe("true");
});

test("the deploy job cannot check out or run pull request code", () => {
  const deploy = job("deploy");
  expect(isRecord(deploy)).toBe(true);
  if (!isRecord(deploy)) throw new Error("deploy job is missing");
  expect(needsOf(deploy)).toContain("build");
  expectIsolatedJob(WORKFLOW, "deploy");
  const download = stepUsing("deploy", "actions/download-artifact@");
  expect(String(at(download, "with", "path"))).toContain("runner.temp");
});

test("the remove job cannot check out or run pull request code", () => {
  expectIsolatedJob(REMOVE_WORKFLOW, "remove");
});
