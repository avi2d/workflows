#!/usr/bin/env bun
import { Console, Effect, FileSystem, Path } from "effect";
import { homedir } from "node:os";
import { runCheck } from "../lib/run.ts";

export type Found = { readonly path: string; readonly executable: boolean };

export function gitleaksIn(files: readonly string[]): readonly string[] {
  return files.filter((file) => file === "gitleaks" || file.endsWith("/gitleaks"));
}

export function cacheProblem(found: readonly Found[]): string | undefined {
  return found.some(({ executable }) => executable) ? undefined : "the cache holds no executable gitleaks, so the next job downloads it again";
}

const check = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const cache = path.join(homedir(), ".cache", "avi2dg-checks", "gitleaks");
  const files = (yield* fs.exists(cache)) ? yield* fs.readDirectory(cache, { recursive: true }) : [];
  const found = yield* Effect.forEach(gitleaksIn(files), (file) =>
    fs.stat(path.join(cache, file)).pipe(Effect.map((info) => ({ path: path.join(cache, file), executable: info.type === "File" && (info.mode & 0o100) !== 0 }))),
  );
  yield* Effect.forEach(found, ({ path: file }) => Console.log(file));
  const problem = cacheProblem(found);
  if (problem !== undefined) yield* Console.log(`::error::${problem}`);
  return problem === undefined;
});

if (import.meta.main) runCheck(check);
