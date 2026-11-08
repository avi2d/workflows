---
kind: reference
audience: consumers
---
# The mutation runs

The mutation runs are the reusable workflow `.github/workflows/mutation.yml`.
It runs the `checks-mutation-*` commands from the caller's install of the `@avi2dg/checks` kit, or from the kit's own source when the caller is the kit.

## What it does

It checks out the commit the caller's run names through the setup action, installs the locked dependencies and runs the mode the caller names.
A caller with no `node_modules/.bin/checks-mutation-*` runs the source files with `bun` in their place.
Only the kit's own repository holds those files, which its `package.json` maps from the command names.
A caller with neither fails the job with a message naming both.
The `baseline` mode restores the last incremental state, runs Stryker incremental and uploads the reports.
The `compare` mode scopes the head against the merge base and restores the baseline state.
It runs the scoped head and files one advisory comment on the pull request.
The `refresh` mode splits the tree into shards from the last full report.
It runs one shard per job and merges the shard reports into a new full report.
`bunx stryker` runs the mutation engine itself and stays as it is in every caller.

## What the caller supplies

- A mode, one of `baseline`, `compare` or `refresh`.
- A calling job that grants `contents: read`, `actions: write` and `pull-requests: write`, the three the runs ask for.
- A shard count and a mutant cap when the defaults, 4 shards and 1500 scoped mutants, do not fit.

## Related topics

- [The shared actions](actions.md)
- [The runner pick](runner.md)
- [The advisory scan](advisories.md)
- [workflows](../README.md)
