import { readFileSync } from "node:fs";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function needsOf(job: Record<string, unknown>): readonly string[] {
  const needs = job["needs"];
  if (typeof needs === "string") return [needs];
  return Array.isArray(needs) ? needs.filter((need): need is string => typeof need === "string") : [];
}

export function at(value: unknown, ...keys: readonly string[]): unknown {
  return keys.reduce((inner, key) => (isRecord(inner) ? inner[key] : undefined), value);
}

export function workflowDocument(workflow: string): unknown {
  return Bun.YAML.parse(readFileSync(workflow, "utf8"));
}

export function workflowSteps(workflow: string, job: string): readonly Record<string, unknown>[] {
  const body = at(workflowDocument(workflow), "jobs", job);
  const steps: unknown[] = isRecord(body) && Array.isArray(body["steps"]) ? body["steps"] : [];
  return steps.filter(isRecord);
}
