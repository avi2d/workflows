import { readFileSync } from "node:fs";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function workflowSteps(workflow: string, job: string): readonly Record<string, unknown>[] {
  const document: unknown = Bun.YAML.parse(readFileSync(workflow, "utf8"));
  const jobs = isRecord(document) ? document["jobs"] : undefined;
  const body = isRecord(jobs) ? jobs[job] : undefined;
  const steps: unknown[] = isRecord(body) && Array.isArray(body["steps"]) ? body["steps"] : [];
  return steps.filter(isRecord);
}
