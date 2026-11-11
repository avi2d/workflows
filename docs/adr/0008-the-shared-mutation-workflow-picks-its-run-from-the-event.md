---
governs: [.github/workflows/mutation.yml]
---
# 0008. The shared mutation workflow picks its run from the caller's event

Date: 2026-11-11

## Status

Accepted.
It changes the default of the `mode` input from `baseline` to none.
It supersedes the clause of 0001 that has a merge to main run the `baseline` mode.

## Context

The `mode` input defaulted to `baseline`, and the workflow never read the event, so a caller that named only the workflow ran a full baseline on every pull request, push and manual start.
A caller that sent a `mode` needed an expression that reads the event, and that expression is code the caller carries.

## Decision

`mode` keeps its name and its three values, and defaults to none.
With none the workflow reads the event that started the caller: `compare` on a `pull_request`, `refresh` on a `workflow_dispatch`, and no mutation job on any other event.
A named `mode` runs as named on any event, so a caller that sends one, as the checks kit's caller does, runs the same jobs as before.
The concurrency group takes the same pick, so a named `refresh` and a manual start share one group.

## Consequences

A caller with no inputs runs the changed-files compare on each pull request, the full run in parts on a manual start, and nothing on a push to main.
A caller that sent no `mode` before loses the baseline it ran on every event, and runs the pick instead, so a baseline runs only when a caller names it.
`baseline` keeps its job and its saved state, so a caller that names it is unchanged.
`refresh-shard` and `refresh-merge` take the skip of `refresh-plan` through `needs`, so they no longer repeat the mode condition.
