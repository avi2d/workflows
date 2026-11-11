---
governs: [.github/workflows/mutation.yml]
---
# 0001. Mutation runs in one shared advisory workflow

Date: 2026-11-07

## Status

Accepted.
0005 supersedes its `compare` clause.

## Context

A mutation run takes far longer than the other gates, so a pull request that waited on it would wait for hours.
Each repository that kept its own mutation job drifted from the others in how it scoped, cached and reported a run.
A night run that compared scores on main reported a lower score only after the change had merged, and opened an issue nobody had asked for.

## Decision

Mutation runs in `.github/workflows/mutation.yml`, which every caller reaches separately from its `ci.yml`.
A merge to main runs the `baseline` mode, and a pull request runs the `compare` mode, which posts one advisory comment.
The `refresh` mode is a full run in shards that firstmate starts by hand every 28 days in each repository.
No run of it is a required check, and none runs on a schedule.

## Consequences

A pull request merges without waiting on mutation, and its author reads the comment for the mutants the change let live.
A change to how mutation runs lands once here and reaches every caller.
The full baseline is only as fresh as the last hand-started refresh.
