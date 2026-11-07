import { readFileSync } from "node:fs";

const probeGuard = "${{ !vars.CI_RUNS_ON }}";
const pickGuard = "${{ vars.CI_RUNS_ON }}";
const pickRunner = "${{ vars.CI_RUNS_ON || 'ubuntu-latest' }}";
const hostedRunner = "ubuntu-latest";
const runsOnOutput = "${{ vars.CI_RUNS_ON || jobs.hosted-minutes.outputs.runs-on || 'ubuntu-latest' }}";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkRunnerPick(text: string): string | null {
  const document = Bun.YAML.parse(text);
  if (!isRecord(document)) {
    return "runner.yml parses to no mapping";
  }
  const jobs = document["jobs"];
  if (!isRecord(jobs)) {
    return "runner pick holds no jobs mapping";
  }
  const hosted = jobs["hosted-minutes"];
  if (!isRecord(hosted)) {
    return "runner pick holds no hosted probe job";
  }
  if (hosted["if"] !== probeGuard) {
    return "runner pick runs the hosted probe with CI_RUNS_ON set";
  }
  if (hosted["runs-on"] !== hostedRunner) {
    return "runner pick bills more than the probe without CI_RUNS_ON";
  }
  const pick = jobs["pick"];
  if (!isRecord(pick)) {
    return "runner pick holds no pick job";
  }
  if (pick["if"] !== pickGuard) {
    return "runner pick leaves no job running with CI_RUNS_ON set";
  }
  if (pick["runs-on"] !== pickRunner) {
    return "runner pick bills a hosted minute with CI_RUNS_ON set";
  }
  const trigger = document["on"];
  if (!isRecord(trigger)) {
    return "runner pick holds no trigger mapping";
  }
  const call = trigger["workflow_call"];
  if (!isRecord(call)) {
    return "runner pick holds no workflow call trigger";
  }
  const outputs = call["outputs"];
  if (!isRecord(outputs)) {
    return "runner pick holds no outputs mapping";
  }
  const runsOn = outputs["runs-on"];
  if (!isRecord(runsOn)) {
    return "runner pick holds no runs-on output";
  }
  if (runsOn["value"] !== runsOnOutput) {
    return "runner pick drops the caller label or the ubuntu-latest fallback";
  }
  return null;
}

function fail(cause: unknown): never {
  console.error(`runner-pick-check: ${cause instanceof Error ? cause.message : String(cause)}`);
  process.exit(1);
}

let text: string;
try {
  text = readFileSync(".github/workflows/runner.yml", "utf8");
} catch (cause) {
  fail(cause);
}

let failure: string | null;
try {
  failure = checkRunnerPick(text);
} catch (cause) {
  fail(cause);
}

if (failure !== null) {
  fail(new Error(failure));
}

console.log("runner pick skips the probe with CI_RUNS_ON set and always leaves a job running");
