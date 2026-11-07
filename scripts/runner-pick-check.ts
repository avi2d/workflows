import { Effect } from "effect";

type Scalar = string | boolean | null;

type Labels = {
  readonly caller: string;
  readonly probe: string;
};

type Expression =
  | { readonly kind: "quoted"; readonly value: string }
  | { readonly kind: "lookup"; readonly path: string }
  | { readonly kind: "deny"; readonly inner: Expression }
  | { readonly kind: "either"; readonly left: Expression; readonly right: Expression }
  | { readonly kind: "both"; readonly left: Expression; readonly right: Expression }
  | { readonly kind: "same"; readonly left: Expression; readonly right: Expression; readonly negate: boolean };

type Token =
  | { readonly kind: "quoted"; readonly value: string }
  | { readonly kind: "word"; readonly text: string }
  | { readonly kind: "mark"; readonly text: string };

type JobShape = {
  readonly guard: unknown;
  readonly runner: unknown;
};

type PickShape = {
  readonly output: unknown;
  readonly hosted: JobShape;
  readonly pick: JobShape;
  readonly jobs: Readonly<Record<string, JobShape>>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tokenize(source: string): readonly Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const character = source[index] ?? "";
    if (character === " " || character === "\t" || character === "\n" || character === "\r") {
      index += 1;
    } else if (character === "\u0027") {
      let value = "";
      let closed = false;
      index += 1;
      while (index < source.length) {
        if (source[index] === "\u0027") {
          closed = true;
          index += 1;
          break;
        }
        value += source[index];
        index += 1;
      }
      if (!closed) {
        throw new Error(`expression leaves a quote open in ${source}`);
      }
      tokens.push({ kind: "quoted", value });
    } else if (character === "(" || character === ")") {
      tokens.push({ kind: "mark", text: character });
      index += 1;
    } else if (character === "!") {
      const pair = source[index + 1] === "=";
      tokens.push({ kind: "mark", text: pair ? "!=" : "!" });
      index += pair ? 2 : 1;
    } else if (character === "|" && source[index + 1] === "|") {
      tokens.push({ kind: "mark", text: "||" });
      index += 2;
    } else if (character === "&" && source[index + 1] === "&") {
      tokens.push({ kind: "mark", text: "&&" });
      index += 2;
    } else if (character === "=" && source[index + 1] === "=") {
      tokens.push({ kind: "mark", text: "==" });
      index += 2;
    } else if (/[A-Za-z0-9_.-]/.test(character)) {
      let text = "";
      while (index < source.length) {
        const next = source[index] ?? "";
        if (!/[A-Za-z0-9_.-]/.test(next)) {
          break;
        }
        text += next;
        index += 1;
      }
      tokens.push({ kind: "word", text });
    } else {
      throw new Error(`expression holds a mark the check cannot read in ${source}`);
    }
  }
  return tokens;
}

function parseExpression(source: string): Expression {
  const tokens = tokenize(source);
  let position = 0;
  const peek = (): Token | undefined => tokens[position];
  const take = (): Token => {
    const token = tokens[position];
    if (token === undefined) {
      throw new Error(`expression ends early in ${source}`);
    }
    position += 1;
    return token;
  };
  const parsePrimary = (): Expression => {
    const token = take();
    if (token.kind === "quoted") {
      return { kind: "quoted", value: token.value };
    }
    if (token.kind === "word") {
      return { kind: "lookup", path: token.text };
    }
    if (token.kind === "mark" && token.text === "(") {
      const inner = parseEither();
      const closing = take();
      if (closing.kind !== "mark" || closing.text !== ")") {
        throw new Error(`expression leaves a group open in ${source}`);
      }
      return inner;
    }
    throw new Error(`expression holds a mark the check cannot read in ${source}`);
  };
  const parseUnary = (): Expression => {
    const token = peek();
    if (token !== undefined && token.kind === "mark" && token.text === "!") {
      take();
      return { kind: "deny", inner: parseUnary() };
    }
    return parsePrimary();
  };
  const parseSame = (): Expression => {
    let left = parseUnary();
    let token = peek();
    while (token !== undefined && token.kind === "mark" && (token.text === "==" || token.text === "!=")) {
      const negate = token.text === "!=";
      take();
      left = { kind: "same", left, right: parseUnary(), negate };
      token = peek();
    }
    return left;
  };
  const parseBoth = (): Expression => {
    let left = parseSame();
    let token = peek();
    while (token !== undefined && token.kind === "mark" && token.text === "&&") {
      take();
      left = { kind: "both", left, right: parseSame() };
      token = peek();
    }
    return left;
  };
  const parseEither = (): Expression => {
    let left = parseBoth();
    let token = peek();
    while (token !== undefined && token.kind === "mark" && token.text === "||") {
      take();
      left = { kind: "either", left, right: parseBoth() };
      token = peek();
    }
    return left;
  };
  const root = parseEither();
  if (position !== tokens.length) {
    throw new Error(`expression holds a mark the check cannot read in ${source}`);
  }
  return root;
}

function isTruthy(value: Scalar): boolean {
  return value !== false && value !== null && value !== "";
}

function resolve(path: string, labels: Labels): Scalar {
  const folded = path.toLowerCase();
  if (folded === "vars.ci_runs_on") {
    return labels.caller;
  }
  if (folded === "jobs.hosted-minutes.outputs.runs-on") {
    return labels.probe;
  }
  if (folded === "true") {
    return true;
  }
  if (folded === "false") {
    return false;
  }
  if (folded === "null") {
    return null;
  }
  return null;
}

function evaluate(node: Expression, labels: Labels): Scalar {
  switch (node.kind) {
    case "quoted":
      return node.value;
    case "lookup":
      return resolve(node.path, labels);
    case "deny":
      return !isTruthy(evaluate(node.inner, labels));
    case "either": {
      const left = evaluate(node.left, labels);
      return isTruthy(left) ? left : evaluate(node.right, labels);
    }
    case "both": {
      const left = evaluate(node.left, labels);
      return isTruthy(left) ? evaluate(node.right, labels) : left;
    }
    case "same": {
      const left = evaluate(node.left, labels);
      const right = evaluate(node.right, labels);
      return node.negate ? left !== right : left === right;
    }
  }
}

function fieldValue(field: unknown, labels: Labels): Scalar {
  if (typeof field === "boolean") {
    return field;
  }
  if (typeof field !== "string") {
    throw new Error("runner pick holds a field the check cannot read");
  }
  const match = /^\$\{\{([\s\S]*)\}\}$/.exec(field.trim());
  if (match === null) {
    return field;
  }
  return evaluate(parseExpression(match[1] ?? ""), labels);
}

function guardValue(guard: unknown, labels: Labels): Scalar {
  if (typeof guard === "boolean") {
    return guard;
  }
  if (typeof guard !== "string") {
    throw new Error("runner pick holds a guard the check cannot read");
  }
  const match = /^\$\{\{([\s\S]*)\}\}$/.exec(guard.trim());
  return evaluate(parseExpression(match === null ? guard : match[1] ?? ""), labels);
}

function jobShape(id: string, job: unknown): JobShape {
  if (!isRecord(job)) {
    throw new Error(`runner pick job ${id} holds no mapping`);
  }
  return { guard: job["if"] ?? true, runner: job["runs-on"] };
}

function readShape(text: string): PickShape {
  const document = Bun.YAML.parse(text);
  if (!isRecord(document)) {
    throw new Error("runner.yml parses to no mapping");
  }
  const trigger = document["on"];
  const jobs = document["jobs"];
  if (!isRecord(trigger) || !isRecord(jobs)) {
    throw new Error("runner pick holds no trigger or jobs mapping");
  }
  const call = trigger["workflow_call"];
  if (!isRecord(call)) {
    throw new Error("runner pick holds no workflow call trigger");
  }
  const outputs = call["outputs"];
  if (!isRecord(outputs)) {
    throw new Error("runner pick holds no outputs mapping");
  }
  const runsOn = outputs["runs-on"];
  if (!isRecord(runsOn) || typeof runsOn["value"] !== "string") {
    throw new Error("runner pick holds no runs-on output value");
  }
  if (jobs["hosted-minutes"] === undefined) {
    throw new Error("runner pick holds no hosted probe job");
  }
  if (jobs["pick"] === undefined) {
    throw new Error("runner pick holds no pick job");
  }
  const shapes: Record<string, JobShape> = {};
  for (const [id, job] of Object.entries(jobs)) {
    shapes[id] = jobShape(id, job);
  }
  const hosted = shapes["hosted-minutes"];
  const pick = shapes["pick"];
  if (hosted === undefined || pick === undefined) {
    throw new Error("runner pick holds no probe and pick job pair");
  }
  return { output: runsOn["value"], hosted, pick, jobs: shapes };
}

function verify(shape: PickShape): string | null {
  const cases: readonly { readonly labels: Labels; readonly output: string; readonly hostedRuns: boolean; readonly pickRuns: boolean }[] = [
    { labels: { caller: "self-hosted", probe: "" }, output: "self-hosted", hostedRuns: false, pickRuns: true },
    { labels: { caller: "self-hosted", probe: "ubuntu-latest" }, output: "self-hosted", hostedRuns: false, pickRuns: true },
    { labels: { caller: "", probe: "ubuntu-latest" }, output: "ubuntu-latest", hostedRuns: true, pickRuns: false },
    { labels: { caller: "", probe: "" }, output: "ubuntu-latest", hostedRuns: true, pickRuns: false },
  ];
  for (const current of cases) {
    const hostedRuns = isTruthy(guardValue(shape.hosted.guard, current.labels));
    if (hostedRuns !== current.hostedRuns) {
      return current.labels.caller === "" ? "runner pick skips the hosted probe without CI_RUNS_ON" : "runner pick runs the hosted probe with CI_RUNS_ON set";
    }
    const pickRuns = isTruthy(guardValue(shape.pick.guard, current.labels));
    if (pickRuns !== current.pickRuns) {
      return current.labels.caller === "" ? "runner pick runs the pick job without CI_RUNS_ON" : "runner pick leaves no job running with CI_RUNS_ON set";
    }
    if (fieldValue(shape.output, current.labels) !== current.output) {
      return "runner pick drops the caller label or the ubuntu-latest fallback";
    }
    const runners: string[] = [];
    for (const [id, job] of Object.entries(shape.jobs)) {
      const runs = id === "hosted-minutes" ? hostedRuns : id === "pick" ? pickRuns : isTruthy(guardValue(job.guard, current.labels));
      if (runs) {
        const runner = fieldValue(job.runner, current.labels);
        if (typeof runner !== "string" || runner === "") {
          return "runner pick names a runner the check cannot read";
        }
        runners.push(runner);
      }
    }
    if (runners.length === 0) {
      return "runner pick leaves no job running";
    }
    if (current.labels.caller !== "") {
      if (runners.some((runner) => runner !== current.labels.caller)) {
        return "runner pick bills a hosted minute with CI_RUNS_ON set";
      }
    } else if (runners.length !== 1 || runners[0] !== "ubuntu-latest") {
      return "runner pick runs more than the hosted probe without CI_RUNS_ON";
    }
  }
  return null;
}

function shapeOf(text: string): Effect.Effect<PickShape, Error> {
  return Effect.try({
    try: () => readShape(text),
    catch: (cause) => new Error(cause instanceof Error ? cause.message : String(cause)),
  });
}

const program = Effect.gen(function* () {
  const text = yield* Effect.promise(() => Bun.file(".github/workflows/runner.yml").text());
  const shape = yield* shapeOf(text);
  const failure = verify(shape);
  if (failure !== null) {
    return yield* Effect.fail(new Error(failure));
  }
  yield* Effect.log("runner pick resolves CI_RUNS_ON first and always leaves a job running");
});

Effect.runPromise(program).catch((cause) => {
  console.error(`runner-pick-check: ${String(cause)}`);
  process.exit(1);
});
