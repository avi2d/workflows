import { expect, test } from "bun:test";
import { join } from "node:path";
import { type Context, conditionRuns, expressionValue } from "../../lib/condition.ts";
import { at, workflowDocument, workflowSteps } from "../../lib/workflow.ts";

const CHANGES = join(import.meta.dir, "../../../.github/workflows/changes.yml");
const document = workflowDocument(CHANGES);
const RELEASE = String(at(document, "jobs", "changes", "env", "RELEASE"));

const KIT_RELEASE_RUN =
  "(github.event_name == 'workflow_dispatch' && startsWith(github.ref_name, 'release/')) || (github.event_name == 'pull_request' && github.head_ref == format('release/{0}', github.base_ref) && github.event.pull_request.head.repo.full_name == github.repository)";

const REPOSITORY = "avi2d/example";

function run(event: string, fields: Partial<Record<string, string>> = {}): Context {
  return {
    "github.event_name": event,
    "github.ref_name": "",
    "github.head_ref": "",
    "github.base_ref": "",
    "github.event.pull_request.head.repo.full_name": "",
    "github.repository": REPOSITORY,
    ...fields,
  };
}

const CASES: readonly [string, Context, boolean][] = [
  ["a dispatch on a release branch", run("workflow_dispatch", { "github.ref_name": "release/main" }), true],
  ["a dispatch on main", run("workflow_dispatch", { "github.ref_name": "main" }), false],
  [
    "a release pull request from this repository",
    run("pull_request", { "github.head_ref": "release/main", "github.base_ref": "main", "github.event.pull_request.head.repo.full_name": REPOSITORY }),
    true,
  ],
  [
    "a fork pull request from a branch named release/main",
    run("pull_request", { "github.head_ref": "release/main", "github.base_ref": "main", "github.event.pull_request.head.repo.full_name": "someone/example" }),
    false,
  ],
  [
    "a pull request from release/main into another base",
    run("pull_request", { "github.head_ref": "release/main", "github.base_ref": "next", "github.event.pull_request.head.repo.full_name": REPOSITORY }),
    false,
  ],
  [
    "a feature pull request",
    run("pull_request", { "github.head_ref": "feat/x", "github.base_ref": "main", "github.event.pull_request.head.repo.full_name": REPOSITORY }),
    false,
  ],
  ["a push to a release branch", run("push", { "github.ref_name": "release/main" }), false],
];

test("a release output that disagrees with the kit's release run rule on any run fails", () => {
  for (const [name, context, release] of CASES) {
    expect([name, conditionRuns(RELEASE, context)]).toEqual([name, release]);
    expect([name, conditionRuns(KIT_RELEASE_RUN, context)]).toEqual([name, release]);
  }
});

test("a release output that does not read the release rule fails", () => {
  const jobRelease = String(at(document, "jobs", "changes", "outputs", "release"));
  const workflowRelease = String(at(document, "on", "workflow_call", "outputs", "release", "value"));
  for (const release of ["true", "false"]) {
    expect(expressionValue(jobRelease, { "env.RELEASE": release })).toBe(release);
    expect(expressionValue(workflowRelease, { "jobs.changes.outputs.release": release })).toBe(release);
  }
});

test("a changes job that sets up or classifies on a release run, or skips that work on any other run, fails", () => {
  const steps = workflowSteps(CHANGES, "changes");
  expect(steps.length).toBeGreaterThan(0);
  for (const step of steps) {
    expect(conditionRuns(step["if"], { "env.RELEASE": "true" })).toBe(false);
    expect(conditionRuns(step["if"], { "env.RELEASE": "false" })).toBe(true);
  }
});

test("a docs-only output left empty on a release run fails", () => {
  const docsOnly = String(at(document, "jobs", "changes", "outputs", "docs-only"));
  expect(expressionValue(docsOnly, {})).toBe("false");
  expect(expressionValue(docsOnly, { "steps.classify.outputs.docs-only": "" })).toBe("false");
  expect(expressionValue(docsOnly, { "steps.classify.outputs.docs-only": "true" })).toBe("true");
  expect(expressionValue(docsOnly, { "steps.classify.outputs.docs-only": "false" })).toBe("false");
});
