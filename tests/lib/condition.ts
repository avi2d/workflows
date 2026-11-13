export type Context = Readonly<Record<string, string>>;

export type Status = {
  readonly always: boolean;
  readonly cancelled: boolean;
  readonly success: boolean;
  readonly failure: boolean;
};

const running: Status = { always: true, cancelled: false, success: true, failure: false };

export function conditionRuns(condition: unknown, context: Context, status: Status = running): boolean {
  if (typeof condition !== "string" || condition.trim() === "") return true;
  const source = condition;
  let pos = 0;
  const skipSpaces = (): void => {
    while (pos < source.length && /\s/.test(source[pos] ?? "")) pos += 1;
  };
  const toBoolean = (value: string | boolean): boolean => (typeof value === "boolean" ? value : value !== "");
  const toText = (value: string | boolean): string => (typeof value === "boolean" ? String(value) : value);
  function parseOperand(): string | boolean {
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
    while (pos < source.length && /[A-Za-z0-9_.]/.test(source[pos] ?? "")) name += source[pos++] ?? "";
    if (name === "") throw new Error(`cannot read ${condition}`);
    skipSpaces();
    if (source[pos] === "(") {
      pos += 1;
      skipSpaces();
      if (source[pos] !== ")") throw new Error(`cannot read ${condition}`);
      pos += 1;
      if (name === "always") return status.always;
      if (name === "success") return status.success;
      if (name === "cancelled") return status.cancelled;
      if (name === "failure") return status.failure;
      return true;
    }
    if (name === "true") return true;
    if (name === "false") return false;
    const value = context[name];
    if (value === undefined) throw new Error(`cannot read ${condition}`);
    return value;
  }
  function parseComparison(): string | boolean {
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
  function parseNot(): boolean {
    skipSpaces();
    if (source[pos] === "!") {
      pos += 1;
      return !parseNot();
    }
    if (source[pos] === "(") {
      pos += 1;
      const inner = parseOr();
      skipSpaces();
      if (source[pos] !== ")") throw new Error(`cannot read ${condition}`);
      pos += 1;
      return inner;
    }
    return toBoolean(parseComparison());
  }
  function parseAnd(): boolean {
    let left = parseNot();
    for (;;) {
      skipSpaces();
      if (!source.startsWith("&&", pos)) return left;
      pos += 2;
      left = parseNot() && left;
    }
  }
  function parseOr(): boolean {
    let left = parseAnd();
    for (;;) {
      skipSpaces();
      if (!source.startsWith("||", pos)) return left;
      pos += 2;
      left = parseAnd() || left;
    }
  }
  const result = parseOr();
  skipSpaces();
  if (pos !== source.length) throw new Error(`cannot read ${condition}`);
  return result;
}
