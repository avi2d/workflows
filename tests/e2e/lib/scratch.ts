import { afterEach, beforeEach } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type Scratch = {
  readonly at: (...parts: readonly string[]) => string;
  readonly read: (name: string) => string;
  readonly write: (name: string, text: string) => void;
};

export function useScratch(prefix: string): Scratch {
  let root = "";
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), `${prefix}-`));
    writeFileSync(join(root, "output"), "");
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const at = (...parts: readonly string[]) => join(root, ...parts);
  return {
    at,
    read: (name) => (existsSync(at(name)) ? readFileSync(at(name), "utf8") : ""),
    write: (name, text) => {
      writeFileSync(at(name), text);
    },
  };
}
