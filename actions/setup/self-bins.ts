import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const root = process.cwd();
const manifest: unknown = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (isRecord(manifest) && manifest["name"] === "@avi2dg/checks") {
  const bins = manifest["bin"];
  if (!isRecord(bins)) throw new Error("@avi2dg/checks needs a bin map");
  const binDir = join(root, "node_modules", ".bin");
  mkdirSync(binDir, { recursive: true });
  for (const [name, source] of Object.entries(bins)) {
    if (!/^[A-Za-z0-9._-]+$/.test(name) || typeof source !== "string") throw new Error("Invalid package bin");
    const target = resolve(root, source);
    const path = relative(root, target);
    if (path === "" || path.startsWith("..") || isAbsolute(path)) throw new Error(`Invalid source for ${name}`);
    const wrapper = join(binDir, name);
    rmSync(wrapper, { force: true });
    const quoted = `'${target.replaceAll("'", "'\\''")}'`;
    writeFileSync(wrapper, `#!/bin/sh\nexec bun ${quoted} "$@"\n`, { mode: 0o755 });
    chmodSync(wrapper, 0o755);
  }
}
