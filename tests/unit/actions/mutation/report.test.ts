import { describe, expect, test } from "bun:test";
import {
  COMMENT_LIMIT,
  fileScores,
  overCapNote,
  type Report,
  scopeComment,
  scopedFiles,
  scopeFiles,
  scoreLine,
  scoreOf,
  scoreSummary,
  shardsOf,
} from "../../../../actions/mutation/report.ts";

const mutants = (...statuses: readonly string[]) => ({ mutants: statuses.map((status) => ({ status })) });

const REPORT: Report = {
  files: {
    "src/a.ts": mutants("Killed", "Timeout", "Survived", "NoCoverage", "Ignored", "CompileError"),
    "src/b.ts": { mutants: [{ status: "Killed" }, { status: "Survived", static: true }, { status: "Survived" }] },
  },
};

describe("scoreOf", () => {
  test("an ignored or compile-error mutant counted, or a timeout read as undetected, fails", () => {
    expect(scoreOf(REPORT.files)).toEqual({ detected: 3, total: 7 });
  });
});

describe("scoreLine", () => {
  test("a percent truncated where it rounds half up, or a percent over no mutants, fails", () => {
    expect(scoreLine({ detected: 3, total: 7 })).toBe("Detected 3 of 7 mutants (43%).");
    expect(scoreLine({ detected: 1, total: 8 })).toBe("Detected 1 of 8 mutants (13%).");
    expect(scoreLine({ detected: 0, total: 0 })).toBe("Detected 0 of 0 mutants.");
  });
});

describe("scoreSummary", () => {
  test("a missing report summarised as a score, or a summary without its heading, fails", () => {
    expect(scoreSummary("mutation baseline", undefined)).toBe("## mutation baseline\n\nNo report was written.\n");
    expect(scoreSummary("mutation refresh", REPORT)).toBe("## mutation refresh\n\nDetected 3 of 7 mutants (43%).\n");
  });
});

describe("scopeFiles", () => {
  test("an escaped glob character left in its brackets, or a bracket unescaped twice, fails", () => {
    expect(scopeFiles("src/a.ts,src/[[]id[]].ts,src/[*][?][(][)][{][}].ts")).toEqual(["src/a.ts", "src/[id].ts", "src/*?(){}.ts"]);
  });
});

describe("scopedFiles", () => {
  test("a file outside the scope kept, or one inside it dropped, fails", () => {
    expect(Object.keys(scopedFiles(REPORT.files, "src/b.ts,src/new.ts"))).toEqual(["src/b.ts"]);
  });
});

describe("overCapNote", () => {
  test("a note that drops the count, the cap or the advice to split fails", () => {
    expect(overCapNote(1600, 1500)).toBe(
      "## mutation score\n\n1600 scoped mutants pass the 1500 mutant cap, so the run stops here.\nSplit the pull request and push again for a scoped run.\n",
    );
  });
});

describe("fileScores", () => {
  test("a file scored with another file's mutants, or files listed out of path order, fails", () => {
    expect(fileScores({ "src/b.ts": REPORT.files["src/b.ts"] ?? { mutants: [] }, "src/a.ts": REPORT.files["src/a.ts"] ?? { mutants: [] } })).toBe(
      "- `src/a.ts`: Detected 2 of 4 mutants (50%).\n- `src/b.ts`: Detected 1 of 3 mutants (33%).\n",
    );
  });
});

describe("scopeComment", () => {
  test("a comment that drops the changed files' score or a file's own line fails", () => {
    expect(scopeComment(REPORT.files)).toBe(
      "## mutation score\n\nThe changed files: Detected 3 of 7 mutants (43%).\n\n- `src/a.ts`: Detected 2 of 4 mutants (50%).\n- `src/b.ts`: Detected 1 of 3 mutants (33%).\n",
    );
  });

  test("a comment over GitHub's body limit, a cut that keeps a split line, or a total over the kept files only, fails", () => {
    const files = Object.fromEntries(Array.from({ length: 2000 }, (_, index) => [`src/${"d".repeat(40)}/f${String(index).padStart(4, "0")}.ts`, mutants("Killed")]));
    const comment = scopeComment(files);
    const [head = "", list = ""] = comment.split("\n\n- ");
    const lines = `- ${list}`.split("\n");
    expect(new TextEncoder().encode(comment).length).toBeLessThanOrEqual(COMMENT_LIMIT);
    expect(head).toBe("## mutation score\n\nThe changed files: Detected 2000 of 2000 mutants (100%).");
    expect(lines.slice(-2)).toEqual(["List cut: every file's score is in the step log.", ""]);
    expect(lines.slice(0, -2).every((line) => /^- `src\/d{40}\/f\d{4}\.ts`: Detected 1 of 1 mutants \(100%\)\.$/.test(line))).toBe(true);
    expect(lines.length).toBeGreaterThan(500);
  });
});

describe("shardsOf", () => {
  test("a shard list read from another line, or a missing line read as empty, fails", () => {
    expect(shardsOf('scope: 3 files\nSHARDS=["src/a.ts","src/b.ts"]\n')).toBe('["src/a.ts","src/b.ts"]');
    expect(shardsOf("scope: 3 files\n")).toBeUndefined();
  });
});
