---
governs: [.github/workflows/release-pr.yml, .github/workflows/release-smoke.yml]
---
# 0004. Release pull request jobs run on the caller runner pick

Date: 2026-11-11

## Status

Accepted.
It supersedes the `release-pr.yml` clause of 0003, which kept those jobs on `ubuntu-latest`.

## Context

0003 moved `release.yml` to the caller's runner pick and left `release-pr.yml` on `ubuntu-latest`.
A caller that sets `CI_RUNS_ON` would therefore plan and tag its release on a hosted runner, with no input to move it.
Only this repository's CI held `release-pr.yml` there: `ci.yml` called it on every pull request, fork pull requests included.
The checks kit refuses the variable on a job a fork pull request reaches in a public repository.

## Decision

Every job in `release-pr.yml` runs on `${{ vars.CI_RUNS_ON || 'ubuntu-latest' }}`, as every job in `release.yml` does.
This repository's smoke call of `release-pr.yml` moves from `ci.yml` to `release-smoke.yml`, which starts only on a manual run and on a push that edits it.
The `release-guard` CI job starts that manual run on the head branch, waits for it, and checks its jobs as it checked the call.
The push trigger stays, because GitHub dispatches a workflow missing from the default branch only after it has run once.
The kit's rule stays as it is, since it is right about every job a fork pull request reaches.

## Consequences

A caller that sets no `CI_RUNS_ON` plans and tags on `ubuntu-latest` as before.
A caller that sets `CI_RUNS_ON` plans and tags on its own runner.
A fork pull request cannot start the smoke with its read-only token, so `release-guard` fails on it.
This repository keeps `CI_RUNS_ON` unset, because `release-guard` takes the smoke as the run of a caller that sets none.
Each CI run starts a second workflow run, and `release-guard` holds a hosted runner while it waits for it.
