export type Context = Readonly<Record<string, string | boolean>>;

export type Status = {
  readonly always: boolean;
  readonly cancelled: boolean;
  readonly success: boolean;
  readonly failure: boolean;
};

export type Value = string | boolean;

const running: Status = { always: true, cancelled: false, success: true, failure: false };

function isTruthy(value: Value): boolean {
  return typeof value === "boolean" ? value : value !== "";
}

function evaluate(condition: unknown, context: Context, status: Status): { value: Value; checkedStatus: boolean } {
  if (typeof condition !== "string" || condition.trim() === "") return { value: true, checkedStatus: false };
  const source = /^\s*\$\{\{([\s\S]*)\}\}\s*$/.exec(condition)?.[1] ?? condition;
  let pos = 0;
  let checkedStatus = false;
  const skipSpaces = (): void => {
    while (pos < source.length && /\s/.test(source[pos] ?? "")) pos += 1;
  };
  const toText = (value: Value): string => (typeof value === "boolean" ? String(value) : value);
  function parseOperand(): Value {
    skipSpaces();
    const quote = source[pos];
    if (quote === "'" || quote === '"') {
      pos += 1;
      let literal = "";
      while (pos < source.length && source[pos] !== quote) literal += source[pos++] ?? "";
      pos += 1;
      return literal;
    }
    let name = "";
    while (pos < source.length && /[A-Za-z0-9_.-]/.test(source[pos] ?? "")) name += source[pos++] ?? "";
    if (name === "") throw new Error(`cannot read ${condition}`);
    skipSpaces();
    if (source[pos] === "(") {
      pos += 1;
      const args = parseArguments();
      if (name === "startsWith" && args.length === 2) return toText(args[0] ?? "").toLowerCase().startsWith(toText(args[1] ?? "").toLowerCase());
      if (name === "format" && args.length > 0) {
        const [template = "", ...values] = args;
        return toText(template).replaceAll(/\{(\d+)\}/g, (_, index: string) => toText(values[Number(index)] ?? ""));
      }
      if (args.length > 0) throw new Error(`cannot read ${condition}`);
      if (name === "always") {
        checkedStatus = true;
        return status.always;
      }
      if (name === "success") {
        checkedStatus = true;
        return status.success;
      }
      if (name === "cancelled") {
        checkedStatus = true;
        return status.cancelled;
      }
      if (name === "failure") {
        checkedStatus = true;
        return status.failure;
      }
      return true;
    }
    if (name === "true") return true;
    if (name === "false") return false;
    const value = context[name];
    if (value === undefined) throw new Error(`cannot read ${condition}`);
    return value;
  }
  function parseArguments(): Value[] {
    const args: Value[] = [];
    skipSpaces();
    while (source[pos] !== ")") {
      if (pos >= source.length) throw new Error(`cannot read ${condition}`);
      args.push(parseOperand());
      skipSpaces();
      if (source[pos] === ",") pos += 1;
    }
    pos += 1;
    return args;
  }
  function parseComparison(): Value {
    const left = parseOperand();
    skipSpaces();
    if (source.startsWith("==", pos) || source.startsWith("!=", pos)) {
      const equal = source.startsWith("==", pos);
      pos += 2;
      const right = parseOperand();
      return equal ? toText(left).toLowerCase() === toText(right).toLowerCase() : toText(left).toLowerCase() !== toText(right).toLowerCase();
    }
    return left;
  }
  function parseNot(): Value {
    skipSpaces();
    if (source[pos] === "!") {
      pos += 1;
      return !isTruthy(parseNot());
    }
    if (source[pos] === "(") {
      pos += 1;
      const inner = parseOr();
      skipSpaces();
      if (source[pos] !== ")") throw new Error(`cannot read ${condition}`);
      pos += 1;
      return inner;
    }
    return parseComparison();
  }
  function parseAnd(): Value {
    let left = parseNot();
    for (;;) {
      skipSpaces();
      if (!source.startsWith("&&", pos)) return left;
      pos += 2;
      const right = parseNot();
      left = isTruthy(left) ? right : left;
    }
  }
  function parseOr(): Value {
    let left = parseAnd();
    for (;;) {
      skipSpaces();
      if (!source.startsWith("||", pos)) return left;
      pos += 2;
      const right = parseAnd();
      left = isTruthy(left) ? left : right;
    }
  }
  const value = parseOr();
  skipSpaces();
  if (pos !== source.length) throw new Error(`cannot read ${condition}`);
  return { value, checkedStatus };
}

export function expressionValue(condition: unknown, context: Context, status: Status = running): Value {
  return evaluate(condition, context, status).value;
}

export function conditionRuns(condition: unknown, context: Context, status: Status = running): boolean {
  if (typeof condition !== "string" || condition.trim() === "") return true;
  const result = evaluate(condition, context, status);
  const runs = isTruthy(result.value);
  return result.checkedStatus ? runs : runs && status.success;
}
