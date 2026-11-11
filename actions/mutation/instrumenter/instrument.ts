import { Instrumenter } from "@stryker-mutator/instrumenter";

type InstrumentedFile = { readonly name: string; readonly content: string };

const silent = () => false;
const ignore = () => undefined;

const SILENT_LOGGER = {
  isTraceEnabled: silent,
  isDebugEnabled: silent,
  isInfoEnabled: silent,
  isWarnEnabled: silent,
  isErrorEnabled: silent,
  isFatalEnabled: silent,
  trace: ignore,
  debug: ignore,
  info: ignore,
  warn: ignore,
  error: ignore,
  fatal: ignore,
} satisfies ConstructorParameters<typeof Instrumenter>[0];

const DEFAULT_MUTATORS = { plugins: null, excludedMutations: [], ignorers: [] };

// An ignored mutant is one a `Stryker disable` comment turns off, and Stryker runs no test for it.
export function instrumentedMutantCount(files: readonly InstrumentedFile[]): Promise<number> {
  return new Instrumenter(SILENT_LOGGER)
    .instrument(
      files.map((file) => ({ ...file, mutate: true })),
      DEFAULT_MUTATORS,
    )
    .then(({ mutants }) => mutants.filter(({ status }) => status !== "Ignored").length);
}
