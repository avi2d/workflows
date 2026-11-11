---
governs: [.github/workflows/mutation.yml]
---
# 0006. A full mutation run tests static mutants in its shards

Date: 2026-11-11

## Status

Accepted.
It supersedes the clause of 0001 that has a merge to main run the `baseline` mode.

## Context

The `refresh` shards skipped static mutants, and a `baseline` run tested them afterwards in one job.
On the checks kit's tree of 27,901 mutants, 4,451 of them static, that one job reached 89% of the static mutants at its 60-minute limit and was cancelled.
A `baseline` whose saved state had expired started from nothing and met the same limit, so no full run could finish.
The same tree in four shards with the static mutants included took between 12 minutes 39 seconds and 28 minutes 32 seconds a shard.
Stryker given the merged shard report as its incremental file reused 27,886 of the 27,901 results and finished in 12 seconds.
The workflow's own `workflow_dispatch` trigger ran it in this repository, which holds nothing to mutate.

## Decision

The `refresh` mode tests static mutants in its shards, so it is the full run and needs no earlier run.
It saves the merged report a second time under the name of the incremental state.
A `baseline` with no saved state of its own starts from that state.
No job's time limit rises above 60 minutes.
No merge to main starts a full run, and a pull request run waits on none.
The workflow starts on `workflow_call` only, so a caller starts a full run by hand from a trigger in its own `mutation.yml` on `main`.

## Consequences

A full run from nothing finishes, and on the kit's tree its longest shard leaves half the limit unused.
A refresh's longest shard on that tree takes 28 minutes 32 seconds where it took 6 minutes 40 seconds.
Shards balance by the mutants that are not static, so the static ones spread unevenly, from 754 to 1,802 a shard on that tree.
A tree whose shard nears the limit takes a higher `shards` input.
The kit drops a restored state it can no longer vouch for at the head, and its log line says why.
A refresh that ran before the workflow saved the state holds no state.
In either case a `baseline` then starts from nothing until a refresh runs.
