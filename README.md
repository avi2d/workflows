# workflows

Shared GitHub Actions plumbing for the avi2d repositories.
It holds composite actions that run inside the caller's own job and reusable workflows that pick the runner, scan for advisories and run mutation.
The repository is public, so every avi2d and azalialaw repository can call it, and it holds no secret, no runner name and no customer data.
A private caller passes its own settings in as inputs, as secrets it names, or through its own repository variables.

## Before you begin

- A Bun repository whose root holds `package.json`, `bun.lock` and `.bun-version`, which the setup action reads.
- The `@avi2dg/checks` kit installed for the docs-only action, which runs its `checks-docs-only` bin.
- A job with `statuses: write` for the commitlint-status and head-status actions.
- Bun on the runner for the secrets-pack action, which the setup action installs.

## Install

To call an action from a workflow, pin it to a version tag:

```yaml
- uses: avi2d/workflows/setup@v1
  with:
    fetch-depth: 0
```

The `v1` tag moves: the maintainer points it at each new `v1.x.y` release, so a caller on `v1` takes each release as it lands.
A caller that wants one fixed version uses its exact tag, such as `v1.1.0`, which never moves.

A caller that wants a SHA pin can still use one, with the tag in a trailing comment.
Find the commit a tag points at, taking the line that ends in `^{}` for an annotated tag:

```sh
git ls-remote https://github.com/avi2d/workflows 'refs/tags/v1.1.0*'
```

```yaml
- uses: avi2d/workflows/setup@<full commit SHA> # v1.1.0
  with:
    fetch-depth: 0
```

A SHA pin keeps the job on the commit that was reviewed, and `sha_pinning_required` accepts only that form.
[The shared actions](docs/actions.md) lists what each action takes and returns.

## Pick the runner

A private caller runs a job on its own self-hosted runner when it names one, and on `ubuntu-latest` otherwise:

```yaml
jobs:
  runner:
    uses: avi2d/workflows/.github/workflows/runner.yml@v1
  checks:
    needs: runner
    runs-on: ${{ needs.runner.outputs.runs-on }}
```

Set the caller's `CI_RUNS_ON` repository variable to the self-hosted label the jobs run on.
A public caller does not call the pick and stays on `ubuntu-latest`, because a fork pull request would run its code on the self-hosted runner.
[The runner pick](docs/runner.md) says how it decides and what it costs.

## Scan for advisories weekly

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
    uses: avi2d/workflows/.github/workflows/advisories.yml@v1
```

A private caller drops the `schedule` trigger and starts the scan with `gh workflow run`.
[The advisory scan](docs/advisories.md) says what it needs from the caller.

## Bump the pin with Dependabot

To have Dependabot move the pin to each new tag:

1. Add `.github/dependabot.yml` to the caller:

   ```yaml
   version: 2
   updates:
     - package-ecosystem: github-actions
       directory: /
       schedule:
         interval: weekly
   ```

1. Merge each pull request Dependabot opens once its CI passes.

Dependabot reads each `owner/repo@ref` in the workflows and, for a SHA pin, moves the SHA and the trailing tag comment to the newest tag.
It leaves `./` references alone.
The same file bumps every other action the caller pins, such as `actions/checkout`.

## What a private caller supplies

| Setting | How it reaches the shared code |
| --- | --- |
| The self-hosted runner label | the caller's `CI_RUNS_ON` repository variable, which the runner pick reads in the caller's context |
| A token other than the job's own | the `token` input of commitlint-status or head-status, written as `${{ secrets.NAME }}` in the caller |
| The heavy slot machines and command | the `runner-prefix` and `command` inputs of heavy-slot |
| The browsers a job needs | the `browsers` input of playwright |
| The private secrets pack | the `pack` input of secrets-pack, written as `${{ secrets.CHECKS_SECRETS_PACK }}` in the caller |

A composite action cannot read the caller's `secrets` context, so a secret reaches it only as an input the caller writes.

## Where things are

| Path | What it holds |
| --- | --- |
| `<name>/` | the composite actions at the root, one directory each |
| `ci/` | the TypeScript the CI smoke jobs run, in place of code inside `ci.yml` |
| `tests/unit/` | the tests of the TypeScript an action or a CI smoke job runs |
| `.github/workflows/runner.yml` | the reusable runner pick |
| `.github/workflows/advisories.yml` | the reusable advisory scan, which also scans this repository weekly |
| `.github/workflows/mutation.yml` | the reusable mutation runs |
| `.github/workflows/ci.yml` | this repository's CI, with actionlint and a smoke job for each action |
| `.github/dependabot.yml` | the weekly bump of the actions this repository pins |

## Related topics

- [The shared actions](docs/actions.md)
- [The runner pick](docs/runner.md)
- [The advisory scan](docs/advisories.md)
- [The mutation runs](docs/mutation.md)
- [Changelog](CHANGELOG.md)
