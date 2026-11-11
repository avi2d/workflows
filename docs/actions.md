---
kind: reference
audience: consumers
---
# The shared actions

Each action is a composite action that runs as steps inside the caller's job on the caller's runner.
A caller calls it as `avi2d/workflows/actions/<name>@v2`.
GitHub does not enforce a composite action's required inputs, so an action that needs one checks it and fails with a message.
Every action but setup, heavy-slot, pages-main-tip, require-success and preview-secrets-check runs its step on the Bun that setup installs, so the caller runs setup first.
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

Writes the `SCOPE` of a pull request's mutation run to the job's environment.
It passes the head's merge base with `origin/<base-ref>` to `checks-mutation-scope`, and restores nothing from main.
An empty `base-ref` scopes against `origin/main`.
The caller checks out the whole history and puts `checks-mutation-scope` on the `PATH` first, as [kit-bin](#kit-bin) does.

| Input | Default | What it sets |
| --- | --- | --- |
| `base-ref` | empty | the branch the head merges into |

## mutation

Runs one part of [the mutation runs](mutation.md) on the reports in the caller's workspace and `$RUNNER_TEMP`.
The `shards` part calls `checks-mutation-scope`, which the caller puts on the `PATH` first, as [kit-bin](#kit-bin) does.

| Part | What it does |
| --- | --- |
| `score` | writes the detected share of `reports/mutation/mutation.json` to the step summary |
| `count-scope` | counts the mutants in the head's `SCOPE` files with Stryker's instrumenter and its default mutators, and writes `SCOPED_MUTANTS`, and `OVER_CAP=true` past the cap |
| `over-cap` | writes the over-cap note to `$RUNNER_TEMP/comment.md` |
| `scope-score` | writes the score of the `SCOPE` files in `reports/mutation/mutation.json`, to `$RUNNER_TEMP/comment.md` |
| `shards` | writes the shard list as the `shards` output |
| `fork-summary` | copies `$RUNNER_TEMP/comment.md` to the step summary |

| Input | Default | What it sets |
| --- | --- | --- |
| `part` | required | the part to run |
| `mode` | empty | the run `score` names in its heading, `baseline` or `refresh` |
| `mutant-cap` | `1500` | the scoped mutants `count-scope` and `over-cap` allow |
| `shards` | `4` | how many shards `shards` splits the tree into |

| Output | Value |
| --- | --- |
| `shards` | the JSON array of mutate globs the `shards` part writes, empty for the other parts |

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

## release-version

Fails unless the tag is `v` followed by the version the manifest holds, and writes that version as the `version` output.
The release publish run calls it on the tag before anything publishes.

| Input | Default | What it sets |
| --- | --- | --- |
| `package-path` | `./package.json` | the manifest holding the released version, relative to the working directory |
| `tag` | the ref the run started on | the tag the version must match |

| Output | Value |
| --- | --- |
| `version` | the version the manifest holds, without the `v` |

## The site actions

The site actions stage, publish and preview a static site on Cloudflare Pages and GitHub Pages.
The caller names every project, host, repository and secret as an input, and passes each secret from its own `secrets` context.
Each heading below names the action's folder under `actions/`.
No action prints a secret, and an action that needs a secret fails with a message when the caller passes it empty.
A caller whose Cloudflare secrets may be unset checks them with [preview-secrets-check](#preview-secrets-check) and guards the Cloudflare steps with an `if:`.

### pages-main-tip

Writes the commit a branch points at as the `sha` output, so later jobs build the same commit after the branch moves.
It fails when the answer is not a full commit SHA.

| Input | Default | What it sets |
| --- | --- | --- |
| `branch` | `main` | the branch to read |
| `repository` | the caller's repository | the repository the branch lives in |
| `token` | the job's token | the token that reads the repository |

| Output | Value |
| --- | --- |
| `sha` | the full SHA the branch points at |

### pages-deploy

Deploys a built folder to a Cloudflare Pages project with wrangler, which it runs under Node 24.
When `address` is set, it first fails unless the project serves `https://<project host>/` at that address, so a build that points at another host never ships.
The commit message it records ends with the first 7 characters of `commit-hash`.

| Input | Default | What it sets |
| --- | --- | --- |
| `project` | required | the Cloudflare Pages project |
| `api-token` | required | the Cloudflare API token, from a secret the caller names |
| `account-id` | required | the Cloudflare account ID, from a secret the caller names |
| `branch` | `main` | the Pages branch the deployment goes to |
| `commit-hash` | the run's commit | the commit the deployment records |
| `commit-message` | empty, wrangler's own | the message the deployment records |
| `address` | empty, no check | the address the build points to |
| `directory` | `dist` | the built folder to deploy |
| `commit-dirty` | `false` | whether wrangler marks the commit as differing from the working tree |
| `wrangler-version` | `4.156.1` | the wrangler release `bunx` runs |

### pages-staged-commit

Writes the commit a Cloudflare Pages project serves in production as the `sha` output, so a production publish ships exactly what staging serves.
It fails unless the served deployment finished, its commit is on `branch`, and a green run of `workflow` holds that commit.
It also fails when `deploy-key` is empty, so a run that cannot publish stops before its tests.

| Input | Default | What it sets |
| --- | --- | --- |
| `project` | required | the Cloudflare Pages project that stages the site |
| `api-token` | required | the Cloudflare API token, from a secret the caller names |
| `account-id` | required | the Cloudflare account ID, from a secret the caller names |
| `deploy-key` | required | the deploy key the later publish pushes with |
| `branch` | `main` | the branch the served commit must be on |
| `workflow` | `pages.yml` | the workflow file whose green run must hold the commit |
| `token` | the job's token | the token that reads commits and workflow runs, which needs `actions: read` |

| Output | Value |
| --- | --- |
| `sha` | the full SHA of the commit the project serves |

### pages-publish

Pushes a built folder to the repository that publishes the site, through a checkout made with the caller's deploy key.
It fails before any change when that repository's `CNAME` does not name `cname`, since GitHub Pages takes the custom domain from that file.
It keeps `CNAME`, replaces every other file with the build, adds `.nojekyll` so folders such as `_assets/` survive, and commits as `github-actions[bot]`.
A build that changes nothing makes no commit.

| Input | Default | What it sets |
| --- | --- | --- |
| `repository` | required | the repository that publishes the site, as `owner/name` |
| `deploy-key` | required | the SSH deploy key with write access to that repository |
| `cname` | required | the custom domain the `CNAME` file must name |
| `source-sha` | required | the commit the build comes from, whose first 7 characters end the commit message |
| `commit-message` | required | the commit message before the source commit |
| `directory` | `dist` | the built folder to publish |
| `branch` | `main` | the branch the site publishes from |
| `path` | `published-site` | where to check that repository out inside the workspace |

### require-success

Fails unless every named result is `success`, and names each one that is not.
A gate job that `needs` other jobs runs it with `if: always()`, so a skipped or cancelled job fails the gate.

| Input | Default | What it sets |
| --- | --- | --- |
| `results` | required | `name=result` pairs separated by whitespace, such as `e2e=${{ needs.e2e.result }}` |

### affected-tests

Runs the always-run tests and the affected test files in one `bun test --randomize` run with one worker per core.
It then runs the affected screen tests with Bun's ignored paths cleared, since the caller's `bunfig.toml` ignores the folder that holds them.
A failing first run skips the screen run.

| Input | Default | What it sets |
| --- | --- | --- |
| `always` | `./tests/unit` | the test paths every run holds, separated by whitespace |
| `files` | empty | the affected test files, separated by whitespace |
| `screens` | empty, no screen run | the affected screen test files, separated by whitespace |

### pages-staging-address

Loads a module of the caller's site and writes the address it exports as the `address` output, failing unless that address is `https`.

| Input | Default | What it sets |
| --- | --- | --- |
| `module` | required | the module that exports the address, relative to the working directory |
| `export` | required | the dotted path of the address among the module's exports |

| Output | Value |
| --- | --- |
| `address` | the https address the module exports |

### preview-secrets-check

Writes whether both Cloudflare secrets reached the job as the `set` output, without printing either.
When one is empty it prints `missing-note` and writes `false`, and the step itself passes.

| Input | Default | What it sets |
| --- | --- | --- |
| `api-token` | empty | the Cloudflare API token |
| `account-id` | empty | the Cloudflare account ID |
| `missing-note` | a line saying the Cloudflare steps skip | the line printed when either is empty |

| Output | Value |
| --- | --- |
| `set` | `true` when both are set, else `false` |

### preview-address

Writes a branch's preview origin, `https://<alias>.<project host>`, as the `origin` output, so the build can point at it before the deploy.
Cloudflare names the alias from the branch, lowercased and with every character but a letter or digit turned to `-`.
It then cuts the alias to 28 characters and trims `-` from both ends.
The project host is read from Cloudflare, which suffixes it when another account holds the name.
It creates the project when it is missing.

| Input | Default | What it sets |
| --- | --- | --- |
| `project` | required | the Cloudflare Pages project the previews go to |
| `branch` | the pull request head branch | the branch whose alias the origin names |
| `api-token` | required | the Cloudflare API token, from a secret the caller names |
| `account-id` | required | the Cloudflare account ID, from a secret the caller names |

| Output | Value |
| --- | --- |
| `origin` | the preview origin, without a trailing slash |

### preview-deploy

Deploys a built folder to a branch of a Cloudflare Pages project with wrangler under Node 24.
It fails unless wrangler reports the branch alias at `origin`, so a preview never points at another address than it is served from.

| Input | Default | What it sets |
| --- | --- | --- |
| `project` | required | the Cloudflare Pages project the previews go to |
| `origin` | required | the origin the build points to, as [preview-address](#preview-address) writes it |
| `api-token` | required | the Cloudflare API token, from a secret the caller names |
| `account-id` | required | the Cloudflare account ID, from a secret the caller names |
| `branch` | the pull request head branch | the branch the preview deploys as |
| `commit-hash` | the pull request head | the commit the deployment records |
| `directory` | `dist` | the built folder to deploy |
| `commit-dirty` | `false` | whether wrangler marks the commit as differing from the working tree |
| `wrangler-version` | `4.156.1` | the wrangler release `bunx` runs |

### preview-comment

Posts the preview link on the pull request, and edits the marked comment `author` wrote when one exists, so the pull request holds one preview comment.

| Input | Default | What it sets |
| --- | --- | --- |
| `origin` | required | the preview origin, as [preview-address](#preview-address) writes it |
| `head-sha` | the pull request head | the commit the preview shows |
| `marker` | required | the hidden first line that marks the preview comment, such as `<!-- site-preview -->` |
| `token` | the job's token | the token that reads and writes the pull request's comments, which needs `pull-requests: write` |
| `pull-request` | the event's pull request | the pull request number |
| `author` | `github-actions[bot]` | the login the token writes as, whose marked comment alone is edited |

### preview-remove

Deletes every preview deployment of a branch from a Cloudflare Pages project, then fails if Cloudflare still lists any.
It reads every page of deployments before deleting, and edits the marked preview comment to say the preview is gone.

| Input | Default | What it sets |
| --- | --- | --- |
| `project` | required | the Cloudflare Pages project the previews go to |
| `branch` | the pull request head branch | the branch whose deployments go |
| `api-token` | required | the Cloudflare API token, from a secret the caller names |
| `account-id` | required | the Cloudflare account ID, from a secret the caller names |
| `marker` | required | the hidden first line that marks the preview comment, such as `<!-- site-preview -->` |
| `token` | the job's token | the token that reads and writes the pull request's comments, which needs `pull-requests: write` |
| `pull-request` | the event's pull request | the pull request number |
| `author` | `github-actions[bot]` | the login the token writes as, whose marked comment alone is edited |

## Related topics

- [The runner pick](runner.md)
- [The advisory scan](advisories.md)
- [The mutation runs](mutation.md)
- [workflows](../README.md)
