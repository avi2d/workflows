---
governs: [.github/workflows/release-pr.yml, .github/workflows/release.yml]
---
# 0003. Release jobs run on the caller runner pick

Date: 2026-11-10

## Status

Accepted.
It supersedes the runner clause of 0002, which put every shared release job on `ubuntu-latest`.
0004 supersedes its `release-pr.yml` clause.

## Context

A caller that sets `CI_RUNS_ON` runs its own release jobs on its own runner.
With every shared release job on `ubuntu-latest`, moving to the shared workflows would put that caller's releases on hosted runners.
The hosted only rule guarded public callers against fork pull requests reaching a self-hosted runner.
A release job is not fork reachable in a caller: the caller triggers it only on a manual run, a push to `main` or a tag push, and each needs write access.

## Decision

Every job in `release.yml` runs on `${{ vars.CI_RUNS_ON || 'ubuntu-latest' }}`, the expression the advisory scan already uses and the checks kit accepts as a hosted runner `CI_RUNS_ON` can override.
Every job in `release-pr.yml` stays on `ubuntu-latest`, because this repository's CI calls it from fork reachable pull requests and the checks kit refuses the variable on such a job.
The jobs read the variable inline rather than call `runner.yml`, so a release adds no pick job and no probe minute.
The shared workflows take no `runs-on` input, since no reusable workflow here takes one and an input lets a caller name a runner the variable does not.
The skeleton check refuses any other runner expression, and this repository's CI fails when its call of `release-pr.yml` plans anywhere but `ubuntu-latest`.

## Consequences

A caller that sets no `CI_RUNS_ON` releases on `ubuntu-latest` as before.
A caller that sets `CI_RUNS_ON` publishes on its own runner, as its own release files do today, while its release pull request stays on `ubuntu-latest`.
A caller without hosted minutes and without `CI_RUNS_ON` sees its release refused before any step, as its own release files would be.
This repository must keep `CI_RUNS_ON` unset, because its CI calls `release-pr.yml` on fork pull requests.
