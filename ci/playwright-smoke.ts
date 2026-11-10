#!/usr/bin/env bun
import { Console, Data, Effect } from "effect";
import { webkit } from "playwright-core";
import { runCheck } from "../lib/run.ts";

class PlaywrightSmokeError extends Data.TaggedError("PlaywrightSmokeError")<{ readonly message: string }> {}

const SMOKE_TITLE = "smoke";

const pageTitle = Effect.acquireUseRelease(
  Effect.tryPromise({ try: () => webkit.launch(), catch: (cause) => new PlaywrightSmokeError({ message: `webkit did not launch: ${String(cause)}` }) }),
  (browser) =>
    Effect.tryPromise({
      try: async () => {
        const page = await browser.newPage();
        await page.setContent(`<title>${SMOKE_TITLE}</title>`);
        return await page.title();
      },
      catch: (cause) => new PlaywrightSmokeError({ message: `webkit did not open a page: ${String(cause)}` }),
    }),
  (browser) => Effect.promise(() => browser.close()),
);

const check = Effect.gen(function* () {
  const title = yield* pageTitle;
  if (title !== SMOKE_TITLE) return yield* new PlaywrightSmokeError({ message: `webkit read the title as ${title}` });
  yield* Console.log(`playwright-smoke: webkit read the title ${title}`);
  return true;
});

if (import.meta.main) runCheck(check);
