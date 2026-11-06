---
kind: reference
audience: consumers
---
# The shared actions

Each action is a composite action, called as `avi2d/workflows/<name>@v1`, that runs as steps inside the caller's job on the caller's runner.
GitHub does not enforce a composite action's required inputs, so an action that needs one checks it and fails with a message.

## setup

Checks out the repository, fails when `.bun-version` is missing, installs the Bun version that file names and runs `bun install --frozen-lockfile`.

| Input | Default | What it sets |
| --- | --- | --- |
| `fetch-depth` | `1` | how many commits to fetch, `0` for the whole history |
| `ref` | empty, the commit the event names | the commit, branch or tag to check out |
| `persist-credentials` | `true` | whether the token stays in the git config for later git commands |
| `cache` | `false` | whether to restore and save the Bun install cache, keyed on `bun.lock` |

A gate that reads the range since the base branch needs `fetch-depth: 0` and `ref: ${{ github.event.pull_request.head.sha || github.sha }}`.

## commitlint-status

Reports the title lint's outcome as the `commitlint` commit status, which a branch protection rule can require.
Only the outcome `success` reports success.
Call it with `if: always()` so a failed title lint still reports.

| Input | Default | What it sets |
| --- | --- | --- |
| `outcome` | required | the title lint step's outcome, such as `${{ steps.title.outcome }}` |
| `head-sha` | the pull request head | the commit the status lands on, with `GITHUB_SHA` when empty |
| `token` | the job's token | the token that writes the status |
| `attempts` | `1` | how many times to try, waiting 10 seconds longer after each failure |

## head-status

Reports a job's result as a commit status on `GITHUB_SHA`, since GitHub keeps a dispatched run's check off the pull request.
Only the status `success` reports success.
Call it last with `if: always() && github.event_name == 'workflow_dispatch'`.

| Input | Default | What it sets |
| --- | --- | --- |
| `job-status` | required | the job's status, as `${{ job.status }}` |
| `context` | the job id | the status name, which a required check of that name counts |
| `token` | the job's token | the token that writes the status |
| `attempts` | `1` | how many times to try, waiting 10 seconds longer after each failure |

## docs-only

Tells whether a change touches only documentation, through `checks-docs-only` from the caller's install of the kit.

| Input | Default | What it sets |
| --- | --- | --- |
| `base` | the pull request base | the commit the change starts from, where empty reports `false` |
| `head` | `HEAD` | the commit the change ends at |

| Output | Value |
| --- | --- |
| `docs-only` | `true` when the change touches only documentation, else `false` |

## playwright

Restores the Playwright browser cache, installs the named browsers through `playwright-core`, and installs their system packages on a GitHub-hosted runner only.
The caller's dependencies hold `playwright-core`.

| Input | Default | What it sets |
| --- | --- | --- |
| `browsers` | `webkit` | the browsers to install, separated by spaces |
| `cache` | `true` | whether to restore and save `~/.cache/ms-playwright`, keyed on the browsers, the runner OS and `bun.lock` |

## heavy-slot

Takes or frees the machine's heavy slot around a heavy step, on runners whose name starts with the prefix the caller names.
A composite action has no post step, so the caller calls it twice, freeing the slot with `if: always()`.

| Input | Default | What it sets |
| --- | --- | --- |
| `action` | required | `acquire` or `release` |
| `runner-prefix` | required | the runner name prefix of the machines that hold a slot, matched without case as `startsWith` matches |
| `command` | required | the slot command, called with the action as its one argument |

## Related topics

- [The runner pick](runner.md)
- [workflows](../README.md)
