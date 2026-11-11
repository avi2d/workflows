import { Schema } from "effect";

const Mutant = Schema.Struct({ status: Schema.String, static: Schema.optional(Schema.Boolean) });

export const Report = Schema.Struct({ files: Schema.Record(Schema.String, Schema.Struct({ mutants: Schema.Array(Mutant) })) });

export type Report = typeof Report.Type;

const DETECTED = new Set(["Killed", "Timeout"]);
const SCORED = new Set([...DETECTED, "Survived", "NoCoverage"]);

export type Score = { readonly detected: number; readonly total: number };

export function scoreOf(files: Report["files"]): Score {
  const scored = Object.values(files).flatMap(({ mutants }) => mutants.filter(({ status }) => SCORED.has(status)));
  return { detected: scored.filter(({ status }) => DETECTED.has(status)).length, total: scored.length };
}

export function scoreLine({ detected, total }: Score): string {
  if (total === 0) return `Detected ${detected} of ${total} mutants.`;
  return `Detected ${detected} of ${total} mutants (${Math.floor((100 * detected + Math.floor(total / 2)) / total)}%).`;
}

export function scoreSummary(title: string, report: Report | undefined): string {
  return `## ${title}\n\n${report === undefined ? "No report was written." : scoreLine(scoreOf(report.files))}\n`;
}

// The scope escapes a glob character in a file name as a one-character class, and the bracket pair goes last so it never unescapes the others twice.
export function scopeFiles(scope: string): readonly string[] {
  return scope
    .split(",")
    .map((glob) => glob.replace(/\[([*?(){}])\]/g, "$1").replace(/\[([[\]])\]/g, "$1"));
}

export function scopedFiles(files: Report["files"], scope: string): Report["files"] {
  const wanted = new Set(scopeFiles(scope));
  return Object.fromEntries(Object.entries(files).filter(([file]) => wanted.has(file)));
}

export function overCapNote(scoped: number, cap: number): string {
  return `## mutation score\n\n${scoped} scoped mutants pass the ${cap} mutant cap, so the run stops here.\nSplit the pull request and push again for a scoped run.\n`;
}

export function scopeComment(files: Report["files"]): string {
  return `## mutation score\n\nThe changed files: ${scoreLine(scoreOf(files))}\n`;
}

export function shardsOf(scopeOutput: string): string | undefined {
  const line = scopeOutput.split("\n").find((candidate) => candidate.startsWith("SHARDS="));
  return line?.slice("SHARDS=".length);
}
