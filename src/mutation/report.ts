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

const UNCOUNTED = new Set(["Ignored", "NoCoverage"]);

// A scoped file the baseline never saw counts as the average of the files it did see.
export function scopedMutants(report: Report | undefined, scope: string): number {
  const files = scopeFiles(scope);
  if (report === undefined) return files.length;
  const counts = Object.values(scopedFiles(report.files, scope)).map(
    ({ mutants }) => mutants.filter((mutant) => mutant.static !== true && !UNCOUNTED.has(mutant.status)).length,
  );
  const sum = counts.reduce((total, count) => total + count, 0);
  const average = counts.length === 0 ? 1 : Math.ceil(sum / counts.length);
  return sum + (files.length - counts.length) * average;
}

export function overCapNote(scoped: number, cap: number): string {
  return `## mutation compare\n\n${scoped} scoped mutants pass the ${cap} mutant cap, so the run stops here.\nSplit the pull request and push again for a scoped run.\n`;
}

export function withoutStaleTests(state: unknown, stale: string): unknown {
  if (typeof state !== "object" || state === null || !("testFiles" in state)) return state;
  const { testFiles } = state;
  if (typeof testFiles !== "object" || testFiles === null) return state;
  const drop = new Set(stale.split(","));
  return { ...state, testFiles: Object.fromEntries(Object.entries(testFiles).filter(([file]) => !drop.has(file))) };
}

export const COMMENT_LIMIT = 60_000;
const KEPT_BYTES = 59_000;

function compareComment(score: Score, body: string): string {
  return `## mutation compare\n\nDetected ${score.detected} of ${score.total} scoped mutants.\n\n\`\`\`\n${body}\`\`\`\n`;
}

// The cut ends a line early, since the byte limit can split the last line or a character in it.
function cutText(text: string): string {
  const kept = new TextDecoder().decode(new TextEncoder().encode(text).slice(0, KEPT_BYTES));
  const lines = kept.split("\n");
  if (kept.endsWith("\n")) lines.pop();
  lines.pop();
  return lines.map((line) => `${line}\n`).join("");
}

export function advisoryComment(score: Score, compared: string): string {
  const whole = compareComment(score, compared);
  if (new TextEncoder().encode(whole).length <= COMMENT_LIMIT) return whole;
  return compareComment(score, `${cutText(compared)}Report cut: the full text is in the step log.\n`);
}

export function shardsOf(scopeOutput: string): string | undefined {
  const line = scopeOutput.split("\n").find((candidate) => candidate.startsWith("SHARDS="));
  return line?.slice("SHARDS=".length);
}
