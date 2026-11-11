import { expect, test } from "bun:test";
import { Effect } from "effect";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mutantCount } from "../../../../actions/mutation/count.ts";

const CLAMP = { name: "src/clamp.ts", content: readFileSync(join(import.meta.dir, "../../../fixtures/mutation-count/clamp.ts"), "utf8") };

test("a count other than the 14 mutants Stryker instruments in the clamp source fails", async () => {
  expect(await Effect.runPromise(mutantCount([CLAMP]))).toBe(14);
});

test("a count that adds up each file other than once fails", async () => {
  expect(await Effect.runPromise(mutantCount([CLAMP, { ...CLAMP, name: "src/clamp-copy.ts" }]))).toBe(28);
});

test("a mutant a Stryker disable comment turns off counted fails", async () => {
  const disabled = { name: "src/off.ts", content: `// Stryker disable all\n${CLAMP.content}` };
  expect(await Effect.runPromise(mutantCount([disabled]))).toBe(0);
});

test("a source that does not parse counted as no mutants fails", async () => {
  const exit = await Effect.runPromiseExit(mutantCount([{ name: "src/broken.ts", content: "export const = ;\n" }]));
  expect(exit._tag).toBe("Failure");
});
