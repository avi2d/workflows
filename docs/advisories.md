---
kind: reference
audience: consumers
---
# The advisory scan

The advisory scan is the reusable workflow `.github/workflows/advisories.yml`, which runs `checks-advisories --all --issue` from the caller's install of the `@avi2dg/checks` kit, or from the kit's own source when the caller is the kit.

## Call it weekly

A caller runs `checks-advisories --all --issue` every week, which files a GitHub issue while `bun.lock` on `main` holds an advisory:

```yaml
on:
  schedule:
    - cron: "15 5 * * 1"
  workflow_dispatch:
jobs:
  advisories:
    permissions:
      contents: read
      issues: write
    uses: avi2d/workflows/.github/workflows/advisories.yml@v2
```

A private caller drops the `schedule` trigger and starts the scan with `gh workflow run`.
The rest of this page says what it needs from the caller.

## What it does

It checks out the commit the caller's run names through the setup action, installs the locked dependencies and runs `checks-advisories --all --issue`.
It puts the command on the `PATH` through the [kit-bin](actions.md#kit-bin) action.
A caller with no `node_modules/.bin/checks-advisories` runs the source file its `package.json` maps from the command name with `bun` in its place, which only the kit's own repository does.
A caller with neither fails the job with a message naming both.
A run on `refs/heads/main` files its verdict as one GitHub issue labelled `advisories`, and a later passing run closes it, as [checks-advisories](https://github.com/avi2d/checks/blob/main/docs/gates/checks-advisories.md#how-it-files-an-issue) says.
A run on any other ref files no issue.
The job fails whenever the scan fails, after it files the issue.

## What the caller supplies

- A kit release that holds `--issue`, `0.86.0` or later.
- A calling job that grants `contents: read` and `issues: write`, the two the scan asks for.
- Its own `CI_RUNS_ON` repository variable when the scan runs on a self-hosted runner, else it runs on `ubuntu-latest`.

It reads no secret: `gh` files the issue with the job's own token.

## When it runs

A public caller calls it on a weekly `schedule` and on `workflow_dispatch`.
A private caller calls it on `workflow_dispatch` only, because `checks-ci-wiring` refuses a scheduled advisory scan in a private repository.
This repository scans itself every Monday at 05:35 UTC from the workflow's own `schedule` trigger.

## Related topics

- [The runner pick](runner.md)
- [The shared actions](actions.md)
- [The mutation runs](mutation.md)
- [The release runs](release.md)
- [workflows](../README.md)
