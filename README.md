# workflows

Shared GitHub Actions plumbing for the avi2d repositories.
It holds composite actions that run inside the caller's own job, and a reusable workflow that picks the runner.
The repository is public, so every avi2d and azalialaw repository can call it, and it holds no secret, no runner name and no customer data.
A private caller passes its own settings in as inputs, as secrets it names, or through its own repository variables.

## Before you begin

- A Bun repository whose root holds `package.json`, `bun.lock` and `.bun-version`, which the setup action reads.
- The `@avi2dg/checks` kit installed for the docs-only action, which runs its `checks-docs-only` bin.
- A job with `statuses: write` for the commitlint-status and head-status actions.

## Install

To call an action from a workflow:

1. Find the commit a release tag points at, taking the line that ends in `^{}` for an annotated tag:

   ```sh
   git ls-remote https://github.com/avi2d/workflows 'refs/tags/<tag>*'
   ```

1. Pin the action to that full commit SHA, with the tag in a trailing comment:

   ```yaml
   - uses: avi2d/workflows/actions/setup@<full commit SHA> # <tag>
     with:
       fetch-depth: 0
   ```

A tag can move and a commit cannot, so the pin keeps the job on the code that was reviewed.
The pin also lets the caller turn on `sha_pinning_required` without an edit.
[The shared actions](docs/actions.md) lists what each action takes and returns.

## Pick the runner

A private caller runs a job on hosted runners while GitHub starts them, and on its own self-hosted runner once the hosted minutes run out:

```yaml
jobs:
  runner:
    uses: avi2d/workflows/.github/workflows/runner.yml@<full commit SHA> # <tag>
  checks:
    needs: runner
    runs-on: ${{ needs.runner.outputs.runs-on }}
```

Set the caller's `CI_RUNS_ON` repository variable to the self-hosted label the jobs fall back to.
A public caller does not call the pick and stays on `ubuntu-latest`, because a fork pull request would run its code on the self-hosted fallback.
[The runner pick](docs/runner.md) says how it decides and what it costs.

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

Dependabot reads each `owner/repo@ref` in the workflows and moves both the SHA and the trailing tag comment to the newest tag.
It leaves `./` references alone.
The same file bumps every other action the caller pins, such as `actions/checkout`.

## What a private caller supplies

| Setting | How it reaches the shared code |
| --- | --- |
| The self-hosted fallback label | the caller's `CI_RUNS_ON` repository variable, which the runner pick reads in the caller's context |
| A token other than the job's own | the `token` input of commitlint-status or head-status, written as `${{ secrets.NAME }}` in the caller |
| The heavy slot machines and command | the `runner-prefix` and `command` inputs of heavy-slot |
| The browsers a job needs | the `browsers` input of playwright |

A composite action cannot read the caller's `secrets` context, so a secret reaches it only as an input the caller writes.

## Where things are

| Path | What it holds |
| --- | --- |
| `actions/` | the composite actions, one directory each |
| `.github/workflows/runner.yml` | the reusable runner pick |
| `.github/workflows/ci.yml` | this repository's CI, with actionlint and a smoke job for each action |
| `.github/dependabot.yml` | the weekly bump of the actions this repository pins |

## Related topics

- [The shared actions](docs/actions.md)
- [The runner pick](docs/runner.md)
- [Changelog](CHANGELOG.md)
