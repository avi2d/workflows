import { describe, expect, test } from "bun:test";
import {
  advisoryComment,
  COMMENT_LIMIT,
  overCapNote,
  type Report,
  scopedFiles,
  scopedMutants,
  scopeFiles,
  scoreLine,
  scoreOf,
  scoreSummary,
  shardsOf,
  withoutStaleTests,
} from "../../../../src/testing/mutation/report.ts";

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

describe("scopedMutants", () => {
  test("a static, ignored or uncovered mutant counted, or an unseen file counted as nothing, fails", () => {
    expect(scopedMutants(REPORT, "src/a.ts,src/b.ts")).toBe(6);
    expect(scopedMutants(REPORT, "src/a.ts,src/b.ts,src/new.ts")).toBe(9);
  });

  test("a scope of unseen files counted as nothing, or no baseline counted other than one per file, fails", () => {
    expect(scopedMutants(REPORT, "src/new.ts,src/other.ts")).toBe(2);
    expect(scopedMutants(undefined, "src/a.ts,src/b.ts,src/c.ts")).toBe(3);
  });
});

describe("overCapNote", () => {
  test("a note that drops the count, the cap or the advice to split fails", () => {
    expect(overCapNote(1600, 1500)).toBe(
      "## mutation compare\n\n1600 scoped mutants pass the 1500 mutant cap, so the run stops here.\nSplit the pull request and push again for a scoped run.\n",
    );
  });
});

describe("withoutStaleTests", () => {
  test("a stale test kept, another test dropped, or the rest of the state changed, fails", () => {
    const state = { files: { "src/a.ts": {} }, testFiles: { "tests/a.test.ts": 1, "tests/b.test.ts": 2, "tests/c.test.ts": 3 } };
    expect(withoutStaleTests(state, "tests/a.test.ts,tests/c.test.ts")).toEqual({ files: { "src/a.ts": {} }, testFiles: { "tests/b.test.ts": 2 } });
  });

  test("a state without testFiles changed fails", () => {
    expect(withoutStaleTests({ files: {} }, "tests/a.test.ts")).toEqual({ files: {} });
  });
});

describe("advisoryComment", () => {
  test("a comment that drops the score or the fenced compare text fails", () => {
    expect(advisoryComment({ detected: 2, total: 3 }, "line one\nline two\n")).toBe(
      "## mutation compare\n\nDetected 2 of 3 scoped mutants.\n\n```\nline one\nline two\n```\n",
    );
  });

  test("a comment over GitHub's body limit, or a cut that keeps a split line, fails", () => {
    const line = `${"x".repeat(99)}\n`;
    const comment = advisoryComment({ detected: 0, total: 0 }, line.repeat(1000));
    expect(new TextEncoder().encode(comment).length).toBeLessThanOrEqual(COMMENT_LIMIT);
    expect(comment).toContain(`${line.repeat(589)}Report cut: the full text is in the step log.\n${"`".repeat(3)}\n`);
    expect(comment).not.toContain(line.repeat(590));
  });
});

describe("shardsOf", () => {
  test("a shard list read from another line, or a missing line read as empty, fails", () => {
    expect(shardsOf('scope: 3 files\nSHARDS=["src/a.ts","src/b.ts"]\n')).toBe('["src/a.ts","src/b.ts"]');
    expect(shardsOf("scope: 3 files\n")).toBeUndefined();
  });
});
