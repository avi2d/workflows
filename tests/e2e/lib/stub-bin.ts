import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function stubBin(dir: string, name: string, then: string): void {
  mkdirSync(dir, { recursive: true });
  const record = `${process.execPath} -e 'console.log(JSON.stringify(process.argv.slice(1)))' -- "$@" >> "$STUB_RECORD"`;
  writeFileSync(join(dir, name), `#!/bin/sh\n${record}\n${then}\n`);
  chmodSync(join(dir, name), 0o755);
}

export function recordedCalls(file: string): unknown[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").trim().split("\n").map((line): unknown => JSON.parse(line));
}
