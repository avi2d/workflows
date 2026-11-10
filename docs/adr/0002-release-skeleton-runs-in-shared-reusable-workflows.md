---
governs: [.github/workflows/release-pr.yml, .github/workflows/release.yml]
---
# 0002. Release skeleton runs in shared reusable workflows

Date: 2026-11-09

## Status

Accepted.

## Context

Every repository that releases on demand repeats the same release pull request gates.
Each copy names the manual dispatch, the push to main, the release commit guard and the tag guard in its own words.
A fix to one gate, such as planning the branch tip on a rerun, must land in every copy to hold everywhere.
The checks kit owns the plan, tag and publish commands, so the shared copy must hold only the skeleton those commands run inside.
Composite actions cannot hold jobs, triggers or concurrency groups, so they cannot carry this skeleton.

## Decision

The skeleton lives in `.github/workflows/release-pr.yml` and `.github/workflows/release.yml`, which every caller reaches through `workflow_call`.
The caller keeps its trigger files and the commands only it needs.
The shared jobs run on `ubuntu-latest` with no runner input, because a public repository runs every fork reachable job on a hosted runner.
A caller side expression the gate cannot prove hosted before the run is refused, so the runner pick stays in the caller and out of this skeleton.
The shared copy keeps the dispatch and push gates, the concurrency group, the guard order and the optional command slots.
The build and the clean tree check are caller inputs with the usual commands as defaults, so a caller with its own build flow passes it as an input.
The tree guard stays optional until the kit ships it, and only checks sets it today.
The full suite stays on the release pull request, and each tag opts in only to the verify commands it still needs.
The publish command runs in a job of its own after the verify job, so the publish token never reaches a caller check.
That job builds the tag again, because the shared copy cannot know which paths a caller's build writes to carry them as an artifact.

## Consequences

A fix to a gate lands once here and reaches every caller that switches.
A caller adopts the shape by passing its commands as inputs, without copying control flow.
The caller trigger files stay reviewable in each repository, beside the commands only that repository needs.
