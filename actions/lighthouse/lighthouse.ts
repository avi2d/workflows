import { Config, Console, Data, Duration, Effect, FileSystem, Path, Schema } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { optionalInput, requiredInput } from "../../lib/inputs.ts";
import { readUntil } from "../../lib/wait.ts";
import { retryWithGrowingWait } from "../../lib/retry.ts";
import { commandPassesWithin } from "../../lib/run.ts";
import { writeOutputs } from "../../lib/step-output.ts";
import { CATEGORY_IDS, type PageScores, Report, reportName, type Scores, scoresOf, summaryTable } from "./scores.ts";
import { choosePages, pagesOf, routesOf, serveSite, siteFiles } from "./site.ts";

class LighthouseError extends Data.TaggedError("LighthouseError")<{ readonly message: string }> {}

const CHROME_NAMES = ["google-chrome-stable", "google-chrome", "chromium", "chromium-browser"];
const CHROME_FLAGS = [
  "--headless=new",
  "--no-sandbox",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-extensions",
  "--disable-component-update",
  "--disable-background-networking",
  "--disable-dev-shm-usage",
  "--remote-debugging-port=0",
];
const PORT_FILE = "DevToolsActivePort";
const PORT_TRIES = 300;
const PORT_WAIT = Duration.millis(100);
const ATTEMPTS = 3;
const RETRY_WAIT = Duration.seconds(5);
const RUN_LIMIT = Duration.minutes(2);

const decodeReport = Schema.decodeUnknownEffect(Schema.fromJsonString(Report));

export function parseRuns(text: string): Effect.Effect<number, LighthouseError> {
  return /^[1-9][0-9]*$/.test(text) ? Effect.succeed(Number(text)) : Effect.fail(new LighthouseError({ message: `runs must be a whole number from 1, not '${text}'` }));
}

const findChrome = Effect.fn("findChrome")(function* (named: string) {
  if (named !== "") {
    const fs = yield* FileSystem.FileSystem;
    if (yield* fs.exists(named)) return named;
    return yield* new LighthouseError({ message: `chrome-path names ${named}, which does not exist` });
  }
  const found = CHROME_NAMES.map((name) => Bun.which(name)).find((chrome) => chrome !== null);
  if (found === undefined) return yield* new LighthouseError({ message: `no ${CHROME_NAMES.join(", ")} is on the PATH, so pass chrome-path` });
  return found;
});

const firstLine = (text: string) => text.split("\n")[0] ?? "";

// chrome-launcher derives its profile folder from the machine's PATH under WSL and breaks there, so the action starts Chrome itself.
const startChrome = Effect.fn("startChrome")(function* (chrome: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const profile = yield* fs.makeTempDirectoryScoped({ prefix: "lighthouse-chrome-" });
  yield* spawner.spawn(ChildProcess.make(chrome, [...CHROME_FLAGS, `--user-data-dir=${profile}`, "about:blank"], { stdin: "ignore", stdout: "ignore", stderr: "ignore" }));
  const portFile = path.join(profile, PORT_FILE);
  const readPort = fs.readFileString(portFile).pipe(
    Effect.map(firstLine),
    Effect.orElseSucceed(() => ""),
  );
  const port = yield* readUntil(readPort, (line) => line !== "", PORT_TRIES, PORT_WAIT);
  if (port === "") return yield* new LighthouseError({ message: `Chrome wrote no debugging port to ${portFile}` });
  return port;
});

const auditOnce = Effect.fn("auditOnce")(
  function* (chrome: string, url: string, reportPath: string) {
    const port = yield* startChrome(chrome);
    return yield* commandPassesWithin(
      "lighthouse",
      [url, "--output=json", `--output-path=${reportPath}`, "--quiet", `--port=${port}`, `--only-categories=${CATEGORY_IDS.join(",")}`],
      RUN_LIMIT,
    );
  },
  Effect.scoped,
  Effect.catch((failure) => Console.log(`::warning::${failure.message}`).pipe(Effect.as(false))),
);

const auditPage = Effect.fn("auditPage")(function* (chrome: string, url: string, reportPath: string) {
  const passed = yield* retryWithGrowingWait(auditOnce(chrome, url, reportPath), {
    attempts: ATTEMPTS,
    wait: RETRY_WAIT,
    onRetry: (attempt) => Console.log(`lighthouse on ${url} attempt ${String(attempt)} failed, retrying`),
  });
  if (!passed) return yield* new LighthouseError({ message: `lighthouse wrote no report for ${url} in ${String(ATTEMPTS)} attempts` });
  const fs = yield* FileSystem.FileSystem;
  return scoresOf(
    yield* decodeReport(yield* fs.readFileString(reportPath)).pipe(
      Effect.mapError(() => new LighthouseError({ message: `${reportPath} is not a Lighthouse report with the four category scores` })),
    ),
  );
});

export const main = Effect.gen(function* () {
  const site = yield* requiredInput("lighthouse", "site", "SITE");
  const runs = yield* parseRuns(yield* Config.String("RUNS").pipe(Config.withDefault("3")));
  const chrome = yield* findChrome(yield* optionalInput("CHROME"));
  const reports = yield* Config.String("REPORTS");
  const { root, files } = yield* siteFiles(site);
  const pages = yield* choosePages(pagesOf(files), yield* optionalInput("PAGES"));
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fs.makeDirectory(reports, { recursive: true });
  const origin = yield* serveSite(root, routesOf(files));
  const results: PageScores[] = [];
  for (const [index, page] of pages.entries()) {
    const url = new URL(page, origin).href;
    const pageRuns: Scores[] = [];
    for (let run = 1; run <= runs; run += 1) {
      yield* Console.log(`lighthouse ${url} run ${String(run)} of ${String(runs)}`);
      pageRuns.push(yield* auditPage(chrome, url, path.join(reports, reportName(index + 1, page, run))));
    }
    results.push({ page, runs: pageRuns });
  }
  const table = summaryTable(results, runs);
  yield* Console.log(table);
  yield* fs.writeFileString(yield* Config.String("GITHUB_STEP_SUMMARY"), table, { flag: "a" });
  yield* writeOutputs({ reports });
  return true;
}).pipe(Effect.scoped);
