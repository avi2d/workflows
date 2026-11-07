import { Effect } from "effect";

const probeGuard = "${{ !vars.CI_RUNS_ON }}";
const pickGuard = "${{ vars.CI_RUNS_ON }}";
const pickRunner = "${{ vars.CI_RUNS_ON }}";
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

const program = Effect.gen(function* () {
  const text = yield* Effect.promise(() => Bun.file(".github/workflows/runner.yml").text());
  const failure = yield* Effect.try({
    try: () => checkRunnerPick(text),
    catch: (cause) => new Error(cause instanceof Error ? cause.message : String(cause)),
  });
  if (failure !== null) {
    return yield* Effect.fail(new Error(failure));
  }
  yield* Effect.log("runner pick skips the probe with CI_RUNS_ON set and always leaves a job running");
});

Effect.runPromise(program).catch((cause) => {
  console.error(`runner-pick-check: ${String(cause)}`);
  process.exit(1);
});
