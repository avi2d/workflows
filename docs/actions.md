---
kind: reference
audience: consumers
---
# The shared actions

Each action is a composite action, called as `avi2d/workflows/actions/<name>@v2`, that runs as steps inside the caller's job on the caller's runner.
GitHub does not enforce a composite action's required inputs, so an action that needs one checks it and fails with a message.
Every action but setup and heavy-slot runs its step on the Bun that setup installs, so the caller runs setup first.
An action whose script imports a package installs this repository's pinned dependencies in its own checkout, apart from the caller's.

## setup

Checks out the repository, fails when `.bun-version` is missing, installs the Bun version that file names and runs `bun install --frozen-lockfile`.

When the caller installs the `@avi2dg/checks` kit, it restores `~/.cache/avi2dg-checks/gitleaks` and saves it at the end of the job.
`checks-secrets` and `checks-pr-text` then find the pinned gitleaks there and download nothing.
The cache key holds the runner OS and architecture and the hash of the kit file that pins the gitleaks release.
A kit that pins a new release misses once and saves its own copy.
A job that never runs gitleaks saves nothing.

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

Reports a job's result as a commit status on `GITHUB_SHA`, or on the commit `head-sha` names, since GitHub keeps a dispatched run's check off the pull request.
Only the status `success` reports success.
Call it last with `if: always() && github.event_name == 'workflow_dispatch'`.

| Input | Default | What it sets |
| --- | --- | --- |
| `job-status` | required | the job's status, as `${{ job.status }}` |
| `context` | the job id | the status name, which a required check of that name counts |
| `head-sha` | empty, `GITHUB_SHA` | the commit the status lands on, such as the pull request head on an `issue_comment` run, where `GITHUB_SHA` is the default branch |
| `description` | empty, none | the status description |
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
Each `install` and `install-deps` call gets 3 minutes per attempt and 3 attempts.
An attempt that runs out of time has its processes stopped before the next one.
The step fails with an error line when every attempt stalls or fails.

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

## kit-bin

Puts the `@avi2dg/checks` commands the caller names on the `PATH`, so later steps call them by name.
A command the caller's kit install holds runs from `node_modules/.bin`.
A command missing there runs its source with `bun`, as the caller's `package.json` maps it under `bin`, which only the kit's own repository does.
A command with neither fails the step with a message naming both.

| Input | Default | What it sets |
| --- | --- | --- |
| `commands` | required | the kit commands to put on the `PATH`, separated by spaces |

## mutation-scope

Writes the `SCOPE` of a mutation compare to the job's environment.
It restores the full baseline report with `checks-mutation-baseline --full` and passes the head's merge base with `origin/<base-ref>` to `checks-mutation-scope`.
An empty `base-ref` scopes against `origin/main`.
The caller checks out the whole history and puts both commands on the `PATH` first, as [kit-bin](#kit-bin) does.

| Input | Default | What it sets |
| --- | --- | --- |
| `base-ref` | empty | the branch the head merges into |

## secrets-pack

Writes the private secrets pack to `$RUNNER_TEMP/secrets-pack.json` and exports that path as `CHECKS_SECRETS_PACK`, so the kit's `checks-secrets` and `checks-pr-text` in later steps read the pack.
The pack reaches it as an input the caller writes, never through `${{ }}` inside a `run:` line.
The caller pins it to the commit the release tag points at, found as [Install](../README.md#install) shows:

```yaml
- uses: avi2d/workflows/actions/secrets-pack@<full commit SHA> # v2.0.0
  with:
    pack: ${{ secrets.CHECKS_SECRETS_PACK }}
```

An empty pack fails the step and writes nothing.
A caller whose secret may be unset guards the call with an `if:`.

| Input | Default | What it sets |
| --- | --- | --- |
| `pack` | required | the pack's JSON, as `${{ secrets.CHECKS_SECRETS_PACK }}` |

## Related topics

- [The runner pick](runner.md)
- [The advisory scan](advisories.md)
- [The mutation runs](mutation.md)
- [workflows](../README.md)
