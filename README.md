# workflows

Shared GitHub Actions plumbing for avi2d repositories.
It holds composite actions that run inside the caller's job, and reusable workflows that pick the runner, scan for advisories, run mutation and release.
The repository is public, so every repository its owners hold can call it, and it holds no secret, no runner name and no customer data.
A private caller passes its settings in as inputs, as secrets it names, or through its repository variables.

## Before you begin

- A Bun repository whose root holds `package.json`, `bun.lock` and `.bun-version`, which the setup action reads.
- The `@avi2dg/checks` kit installed for the docs-only action, which runs its `checks-docs-only` bin unless the caller names `paths`.
- A job with `statuses: write` for the commitlint-status and head-status actions.
- Bun on the runner for the actions [The shared actions](docs/actions.md) names as needing it, which the setup action installs.

## Install

To call an action from a workflow, pin it to a version tag:

```yaml
- uses: avi2d/workflows/actions/setup@v2
  with:
    fetch-depth: 0
```

The `v2` tag moves: the maintainer points it at each new `v2.x.y` release, so a caller on `v2` takes each release as it lands.
A caller that wants one fixed version uses its exact tag, such as `v2.0.0`, which never moves.
The `v1` tags hold the actions at the repository root, so `avi2d/workflows/<name>@v1` still resolves.

A caller that wants a SHA pin can still use one, with the tag in a trailing comment.
Find the commit a tag points at, taking the line that ends in `^{}` for an annotated tag:

```sh
git ls-remote https://github.com/avi2d/workflows 'refs/tags/v2.0.0*'
```

```yaml
- uses: avi2d/workflows/actions/setup@<full commit SHA> # v2.0.0
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
    uses: avi2d/workflows/.github/workflows/runner.yml@v2
  checks:
    needs: runner
    runs-on: ${{ needs.runner.outputs.runs-on }}
```

Set the caller's `CI_RUNS_ON` repository variable to the self-hosted label the jobs run on.
A public caller does not call the pick and stays on `ubuntu-latest`, because a fork pull request would run its code on the self-hosted runner.
[The runner pick](docs/runner.md) says how it decides and what it costs.

## Release on demand

A caller releases on demand through two reusable workflows, as [The release runs](docs/release.md) shows.

## Bump the pin with Dependabot

[Bump the pin with Dependabot](docs/dependabot.md) shows the caller's config.

## What a private caller supplies

| Setting | How it reaches the shared code |
| --- | --- |
| The self-hosted runner label | the caller's `CI_RUNS_ON` repository variable, which the runner pick, the advisory scan and the release runs read in the caller's context |
| A token other than the job's own | the `token` input of commitlint-status or head-status, written as `${{ secrets.NAME }}` in the caller |
| The heavy slot machines and command | the `runner-prefix` and `command` inputs of heavy-slot |
| The browsers a job needs | the `browsers` input of playwright |
| The private secrets pack | the `pack` input of secrets-pack, written as `${{ secrets.CHECKS_SECRETS_PACK }}` in the caller |
| The site projects, hosts, repositories and secrets | the site actions' inputs in [The shared actions](docs/actions.md), written as `${{ secrets.NAME }}` in the caller |

A composite action cannot read the caller's `secrets` context, so a secret reaches it only as an input the caller writes.

## Where things are

| Path | What it holds |
| --- | --- |
| `actions/<name>/` | the composite actions, one flat directory each, holding `action.yml`, the `main.ts` or `main.sh` its steps run, and the TypeScript and shell files that entry calls |
| `lib/` | the code more than one action shares |
| `ci/` | the TypeScript the CI smoke jobs run, in place of code inside `ci.yml` |
| `tests/unit/`, `tests/e2e/` | the tests, under `actions/<name>/`, `lib/`, `ci/` and `workflows/` for the code they test |
| `.github/workflows/runner.yml` | the reusable runner pick |
| `.github/workflows/advisories.yml` | the reusable advisory scan, which also scans this repository weekly |
| `.github/workflows/mutation.yml` | the reusable mutation runs |
| `.github/workflows/release-pr.yml` | the reusable release pull request, plan on dispatch and tag on merge |
| `.github/workflows/release-smoke.yml` | the release pull request smoke, manual and push on edit |
| `.github/workflows/release.yml` | the reusable release publish, guards then the caller publish command and the opt-in GitHub release |
| `.github/workflows/ci.yml` | this repository's CI, with actionlint and a smoke job for each action that has one |
| `.github/dependabot.yml` | the weekly bump of the actions this repository pins |

## Related topics

- [The shared actions](docs/actions.md)
- [The runner pick](docs/runner.md)
- [The advisory scan](docs/advisories.md)
- [The mutation runs](docs/mutation.md)
- [The release runs](docs/release.md)
- [Bump the pin with Dependabot](docs/dependabot.md)
- [Changelog](CHANGELOG.md)
