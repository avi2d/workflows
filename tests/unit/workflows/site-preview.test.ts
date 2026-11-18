import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { at, isRecord, needsOf, workflowDocument, workflowSteps } from "../../lib/workflow.ts";

const WORKFLOW = join(import.meta.dir, "../../../.github/workflows/site-preview.yml");
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

test("the address job cannot check out or run pull request code", () => {
  const steps = workflowSteps(WORKFLOW, "address");
  expect(steps.length).toBeGreaterThan(0);
  expect(steps.every((step) => !("run" in step))).toBe(true);
  expect(steps.some((step) => usesOf(step).startsWith("actions/checkout@"))).toBe(false);
  expect(steps.some((step) => usesOf(step).startsWith("avi2d/workflows/actions/setup@"))).toBe(false);
});

test("the deploy job cannot check out or run pull request code", () => {
  const deploy = job("deploy");
  expect(isRecord(deploy)).toBe(true);
  if (!isRecord(deploy)) throw new Error("deploy job is missing");
  expect(needsOf(deploy)).toContain("build");
  const steps = workflowSteps(WORKFLOW, "deploy");
  expect(steps.length).toBeGreaterThan(0);
  expect(steps.every((step) => !("run" in step))).toBe(true);
  expect(steps.some((step) => usesOf(step).startsWith("actions/checkout@"))).toBe(false);
  expect(steps.some((step) => usesOf(step).startsWith("avi2d/workflows/actions/setup@"))).toBe(false);
  const download = stepUsing("deploy", "actions/download-artifact@");
  expect(String(at(download, "with", "path"))).toContain("runner.temp");
});

test("the preview project reaches the deploy from site-names without a second definition", () => {
  const outputs = at(job("address"), "outputs");
  expect(isRecord(outputs)).toBe(true);
  if (!isRecord(outputs)) throw new Error("address outputs are missing");
  const site = stepUsing("address", "avi2d/workflows/actions/site-names@");
  expect(String(at(site, "with", "pages"))).toContain("inputs.pages");
  const addressPreview = String(at(outputs, "preview"));
  const addressProject = String(at(stepUsing("address", "avi2d/workflows/actions/preview-address@"), "with", "project"));
  const deployProject = String(at(stepUsing("deploy", "avi2d/workflows/actions/preview-deploy@"), "with", "project"));
  const commentMarker = String(at(stepUsing("deploy", "avi2d/workflows/actions/preview-comment@"), "with", "marker"));
  expect(addressPreview).toContain("steps.site.outputs.preview");
  expect(addressProject).toContain("steps.site.outputs.preview");
  expect(deployProject).toContain("needs.address.outputs.preview");
  expect(commentMarker).toContain("needs.address.outputs.preview");
  for (const consumer of [addressPreview, addressProject, deployProject, commentMarker]) {
    expect(consumer).not.toContain("inputs.pages");
  }
});

test("the setup-bun versions cannot drift from .bun-version", () => {
  const pinned = readFileSync(join(import.meta.dir, "../../../.bun-version"), "utf8").trim();
  const versions = [...workflowSteps(WORKFLOW, "address"), ...workflowSteps(WORKFLOW, "deploy")]
    .filter((step) => usesOf(step).startsWith("oven-sh/setup-bun@"))
    .map((step) => String(at(step, "with", "bun-version")));
  expect(versions.length).toBeGreaterThan(0);
  for (const version of versions) expect(version).toBe(pinned);
});
