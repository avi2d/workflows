import { Effect } from "effect";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripWrapping(expression: string): string {
  return expression.trim().replace(/^\$\{\{(.*)\}\}$/s, "$1").trim();
}

function splitAlternatives(inner: string): readonly string[] {
  const parts: string[] = [];
  let current = "";
  let quote: string | null = null;
  let index = 0;
  while (index < inner.length) {
    const character = inner[index];
    if (quote !== null) {
      current += character;
      if (character === quote) {
        quote = null;
      }
      index += 1;
    } else if (character === "\u0027" || character === "\u0022") {
      quote = character;
      current += character;
      index += 1;
    } else if (character === "|" && inner[index + 1] === "|") {
      parts.push(current);
      current = "";
      index += 2;
    } else {
      current += character;
      index += 1;
    }
  }
  parts.push(current);
  return parts.map((part) => part.trim());
}

function compact(expression: string): string {
  return expression.replace(/\s+/g, "").toLowerCase();
}

function pickRunner(callerLabel: string, probeValue: string): string {
  return callerLabel || probeValue || "ubuntu-latest";
}

function probeRuns(callerLabel: string): boolean {
  return callerLabel === "";
}

const program = Effect.gen(function* () {
  const text = yield* Effect.promise(() => Bun.file(".github/workflows/runner.yml").text());
  const document = Bun.YAML.parse(text);
  if (!isRecord(document)) {
    return yield* Effect.fail(new Error("runner.yml parses to no mapping"));
  }
  const trigger = document["on"];
  const jobs = document["jobs"];
  if (!isRecord(trigger) || !isRecord(jobs)) {
    return yield* Effect.fail(new Error("runner pick holds no trigger or jobs mapping"));
  }
  const call = trigger["workflow_call"];
  if (!isRecord(call)) {
    return yield* Effect.fail(new Error("runner pick holds no workflow call trigger"));
  }
  const outputs = call["outputs"];
  if (!isRecord(outputs)) {
    return yield* Effect.fail(new Error("runner pick holds no outputs mapping"));
  }
  const runsOn = outputs["runs-on"];
  if (!isRecord(runsOn) || typeof runsOn["value"] !== "string") {
    return yield* Effect.fail(new Error("runner pick holds no runs-on output value"));
  }
  const hosted = jobs["hosted-minutes"];
  if (!isRecord(hosted) || typeof hosted["if"] !== "string") {
    return yield* Effect.fail(new Error("runner pick holds no hosted probe guard"));
  }
  const alternatives = splitAlternatives(stripWrapping(runsOn["value"])).map(compact);
  const guard = compact(stripWrapping(hosted["if"]));
  if (alternatives.length !== 3 || alternatives[0] !== "vars.ci_runs_on" || alternatives[1] !== "jobs.hosted-minutes.outputs.runs-on" || alternatives[2] !== "\u0027ubuntu-latest\u0027") {
    return yield* Effect.fail(new Error("runner pick prefers the probe over CI_RUNS_ON"));
  }
  if (guard !== "!vars.ci_runs_on") {
    return yield* Effect.fail(new Error("runner pick probes with CI_RUNS_ON set"));
  }
  const labelled = pickRunner("self-hosted", "");
  const labelledOverProbe = pickRunner("self-hosted", "ubuntu-latest");
  const hostedPass = pickRunner("", "ubuntu-latest");
  const hostedRefused = pickRunner("", "");
  if (labelled !== "self-hosted" || probeRuns("self-hosted") || labelledOverProbe !== "self-hosted" || hostedPass !== "ubuntu-latest" || !probeRuns("") || hostedRefused !== "ubuntu-latest") {
    return yield* Effect.fail(new Error("runner pick misses the caller label or the ubuntu-latest fallback"));
  }
  yield* Effect.log("runner pick resolves CI_RUNS_ON first and skips the probe with it set");
});

Effect.runPromise(program).catch((cause) => {
  console.error(`runner-pick-check: ${String(cause)}`);
  process.exit(1);
});
