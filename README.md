# workflows

Shared GitHub Actions plumbing for avi2d repositories.
It holds the shared CI every repository's workflow files call and the composite actions its steps run.
It also holds reusable workflows that pick the runner, scan for advisories, run mutation and release.
It is public, so every repository its owners hold can call it, and it holds no secret, no runner name and no customer data.
A private caller passes its settings in as inputs, named secrets, or repository variables.

## Before you begin

- A Bun repository whose root holds `package.json`, `bun.lock` and `.bun-version`, which the setup action reads.
- The `@avi2dg/checks` kit installed for the docs-only action, which runs its `checks-docs-only` bin unless the caller names `paths`.
- A job with `statuses: write` for the commitlint-status and head-status actions, and `pull-requests: read` as well when head-status reads the head of `pull-request`.
- A job with `contents: write` for the github-release action.
- A job with `actions: write` and `gh` on the runner for the draft-hold action.
- Chrome on the runner for the lighthouse action, which `ubuntu-latest` holds.
- Bun on the runner for the actions [The shared actions](docs/actions.md) names as needing it, which the setup action installs.

## Install

To call an action from a workflow, pin it to a version tag:

```yaml
- uses: avi2d/workflows/actions/setup@v3
  with:
    fetch-depth: 0
```

The `v3` tag moves to each new `v3.x.y` release, so a caller on `v3` takes each release as it lands.
A caller that wants one fixed version uses its exact tag, such as `v3.0.0`, which never moves.
The `v1` tags hold the actions at the repository root, so `avi2d/workflows/<name>@v1` still resolves.

A caller can pin a SHA instead, with the tag in a trailing comment.
Find the commit a tag points at, taking the line that ends in `^{}` for an annotated tag:

```sh
git ls-remote https://github.com/avi2d/workflows 'refs/tags/v3.0.0*'
```

```yaml
- uses: avi2d/workflows/actions/setup@<full commit SHA> # v3.0.0
  with:
    fetch-depth: 0
```

A SHA pin keeps the job on the commit that was reviewed.
The v3 shared workflows call `@v3` tags, so a caller with `sha_pinning_required` turned on cannot call them.
[The shared actions](docs/actions.md) lists what each action takes and returns.

## Call the shared CI

Each workflow file of a site or a code repository calls one shared workflow from `@v3`, or composes the CI parts, as [The shared CI](docs/shared-ci.md) shows.
The `site-preview.yml` part builds without Cloudflare secrets and deploys the artifact in a separate job on an isolated runner.

## Pick the runner

A private caller names its own runner through its `CI_RUNS_ON` repository variable, as [The runner pick](docs/runner.md) shows.

## Release on demand

A caller releases on demand through two reusable workflows, as [The release runs](docs/release.md) shows.

## What a private caller supplies

| Setting | How it reaches the shared code |
| --- | --- |
| The self-hosted runner label | the caller's `CI_RUNS_ON` repository variable, which the runner pick, the advisory scan, the release runs and the shared CI read in the caller's context |
| A token other than the job's own | the `token` input of commitlint-status, head-status or draft-hold, written as `${{ secrets.NAME }}` in the caller |
| The heavy slot machines and command | the `runner-prefix` and `command` inputs of heavy-slot, or the `HEAVY_SLOT_RUNNER_PREFIX` and `HEAVY_SLOT_COMMAND` variables |
| The browsers a job needs | the `browsers` input of playwright |
| The private secrets pack | the `pack` input of secrets-pack, or the `CHECKS_SECRETS_PACK` secret of `static.yml`, written as `${{ secrets.CHECKS_SECRETS_PACK }}` in the caller |
| The site names and secrets | the site workflow inputs and `secrets: inherit` in [The shared CI](docs/shared-ci.md) |

A composite action cannot read the caller's `secrets` context, so each secret reaches it as a caller-written input.

## Related topics

- [The shared CI](docs/shared-ci.md)
- [The shared actions](docs/actions.md)
- [The runner pick](docs/runner.md)
- [The advisory scan](docs/advisories.md)
- [The mutation runs](docs/mutation.md)
- [The release runs](docs/release.md)
- [Bump the pin with Dependabot](docs/dependabot.md)
- [Repository layout](docs/repository-layout.md)
- [Changelog](CHANGELOG.md)
