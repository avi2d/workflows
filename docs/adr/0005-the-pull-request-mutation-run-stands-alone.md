---
governs: [.github/workflows/mutation.yml]
---
# 0005. The pull request mutation run stands alone

Date: 2026-11-11

## Status

Accepted.
It supersedes the clause of 0001 that has the `compare` mode compare the head with main.

## Context

The `compare` mode restored main's full report and incremental state, reused main's results and diffed the head against main's report.
Every one of those needed a recent run on main, and a pull request run whose restore failed or found nothing reported nothing useful.
Stryker reads an incremental file only under `--incremental`, and `stryker run --mutate <files>` tests every mutant in those files against the head's own tests.
`checks-mutation-scope` given no report still prints the changed sources, and Stryker's instrumenter counts a file's mutants with no test run.

## Decision

The `compare` mode mutates the changed files on the head with `stryker run --mutate`, and restores, reuses and compares nothing from main.
It counts the scoped mutants with Stryker's instrumenter on the head's files and skips the run past the cap, 1500 by default.
Its comment gives the changed files' score, in all and per file.
The `baseline` and `refresh` modes stay as they are, for the full run started by hand.

## Consequences

A pull request run needs no artifact from main, so it reports the same way on a fresh repository as on one with a long history.
The comment no longer names the mutants that newly survive against main, and no result is reused, so each run tests every mutant in its scope.
A change to a unit test alone no longer pulls in the sources that test covers, since only changed source files are mutated.
The count applies Stryker's default mutators and no caller ignorer, so it never falls under what the run tests.
