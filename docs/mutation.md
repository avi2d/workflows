---
kind: reference
audience: consumers
---
# The mutation runs

The mutation runs are the reusable workflow `.github/workflows/mutation.yml`.
It runs the `checks-mutation-*` commands from the caller's install of the `@avi2dg/checks` kit, or from the kit's own source when the caller is the kit.

## What it does

It checks out the commit the caller's run names through the setup action, installs the locked dependencies and runs the mode the caller names.
It puts the commands each mode runs on the `PATH` through the [kit-bin](actions.md#kit-bin) action.
A caller with no `node_modules/.bin/checks-mutation-*` runs the source files with `bun` in their place.
Only the kit's own repository holds those files, which its `package.json` maps from the command names.
A caller with neither fails the job with a message naming both.
The `baseline` mode restores the last incremental state, runs Stryker incremental and uploads the reports.
The `compare` mode scopes the head against its merge base with the pull request's base branch.
A run with no pull request scopes against the `main` branch.
The [mutation-scope](actions.md#mutation-scope) action selects that scope.
When the run starts, it ends green with a notice that names the reason on a skipped pull request.
A skip is a release pull request, a bot pull request or a no-source pull request.
A release run held for approval never starts, and held-runs deletes that held run.
The caller needs no path filter and no condition for these.
It needs nothing from main: it restores no report or state and compares with no earlier run.
It counts the scoped mutants on the head and stops with a note past the mutant cap.
Otherwise it mutates the changed files on the head and files one score comment on the pull request.
The comment gives the score of the changed files.
On a fork pull request the run skips the comment and writes the note to the job summary instead.
The job token is read-only on a fork, so filing a comment would fail.
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
- [The release runs](release.md)
- [workflows](../README.md)
