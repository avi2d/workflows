---
kind: reference
audience: consumers
---
# The release runs

The release runs are the reusable workflows `.github/workflows/release-pr.yml` and `.github/workflows/release.yml`.
`release-pr.yml` opens the release pull request on a manual run and tags the release when that pull request merges.
`release.yml` guards the tag and publishes it.
The caller keeps its trigger files and its publish command, and the shared copy keeps the gates every caller repeats.

## Call it

A caller opens its release pull request with one manual run, and merging that pull request creates the tag:

```yaml
on:
  workflow_dispatch:
  push:
    branches: [main]
jobs:
  release-pr:
    permissions:
      contents: write
      pull-requests: write
      actions: write
    uses: avi2d/workflows/.github/workflows/release-pr.yml@v2
    with:
      plan-command: bunx checks-release-pr ci.yml
      tag-command: bunx checks-release-tag release.yml
```

Its tag push publishes the release and creates the GitHub release:

```yaml
on:
  push:
    tags: ["v*"]
  workflow_dispatch:
jobs:
  release:
    permissions:
      contents: write
      id-token: write
    uses: avi2d/workflows/.github/workflows/release.yml@v2
    with:
      node-version: "24"
      publish-command: bunx checks-release-publish
      github-release: true
```

Each trigger file stays in the caller, beside the publish command only that caller needs.

## What it does

`release-pr.yml` runs a `pull-request` job on every run that is not a push to main.
It runs a `tag` job on every push to main whose head commit starts with `chore: release `.
The `pull-request` job checks out the branch tip with the whole history.
It runs the caller preflight when one is set, then the caller plan command with `GH_TOKEN` set.
It then deletes the runs GitHub holds for approval on the release pull request through the [held-runs](actions.md#held-runs) action.
The planning checkout names the branch tip, so a rerun after main moves plans the current tree rather than the stale dispatched commit.
The `tag` job checks out the landed commit with the whole history.
It runs the caller tree guard when one is set, then the caller tag command with `GH_TOKEN` set.
One `release-pull-request` concurrency group serializes competing plans.

`release.yml` runs a `preflight` job when the caller sets a preflight command, then a `verify` job, then a `publish` job.
The `verify` job takes only a tag on main, then runs the caller build command and the clean tree check.
It runs the caller tree guard before the build and the caller lint, typecheck and test commands after the clean tree check.
It matches the tag against the version in the caller manifest through the [release-version](actions.md#release-version) action.
The `publish` job runs only after `verify` passes, and it alone holds `id-token: write`.
With `github-release` set, it first reads the version through [release-version](actions.md#release-version) and writes that version's `CHANGELOG.md` section with `checks-release-notes` from the checks kit.
A missing or empty section fails the job there, before anything is published.
It builds the tag again, runs the clean tree check, and sets up Node with the npm registry when the caller names a Node release.
It then runs the caller publish command with `GH_TOKEN` set, when the caller sets one, and no lint, test or other caller check runs in it.
With `github-release` set, it then creates the GitHub release for the tag, titled with the tag, with the notes it wrote before the publish.
A caller that leaves `github-release` unset writes no notes and runs no step after its publish command.
A call with no publish command and no GitHub release fails instead of publishing nothing.
The lint, typecheck and test commands default to empty, so a caller opts in only to what the tag itself must run.
The build and the clean tree check default to the usual commands, and empty skips them.
A caller whose release pull request already ran the full suite leaves `test-command` empty.

## What the caller sets

The release pull request takes these inputs.

| Input | Default | What it sets |
| --- | --- | --- |
| `plan-command` | required | the command that opens or refreshes the release pull request |
| `preflight-command` | empty, skip the check | the fail-fast check before planning |
| `tree-guard-command` | empty, skip the check | the check that the landed tree matches the tested tree |
| `tag-command` | required | the command that tags the landed release |

The publish run takes these inputs.

| Input | Default | What it sets |
| --- | --- | --- |
| `package-path` | `./package.json` | the manifest holding the released version |
| `preflight-command` | empty, skip the check | the fail-fast check before publishing |
| `tree-guard-command` | empty, skip the check | the check that the tagged tree matches the tested tree |
| `build-command` | `bun run build` | the build the tag runs, empty to skip |
| `clean-tree-command` | `git diff --exit-code` | the check that the tag tree is clean, empty to skip |
| `lint-command` | empty, skip the step | the lint the tag runs |
| `typecheck-command` | empty, skip the step | the typecheck the tag runs |
| `test-command` | empty, skip the step | the test suite the tag runs |
| `node-version` | empty, skip the setup | the Node release set up with the npm registry |
| `publish-command` | empty, skip the step | the command that publishes the tag |
| `github-release` | `false` | whether to create the GitHub release for the tag, with its `CHANGELOG.md` section as the notes written before the publish command and the release created after it |

## What the caller supplies

- Its trigger files, which stay in the caller: a `release-pr` workflow on `workflow_dispatch` plus push to `main`, and a `release` workflow on tag push plus `workflow_dispatch`.
- The plan and tag commands, usually `bunx checks-release-pr ci.yml` and `bunx checks-release-tag release.yml` from the checks kit.
- A tree guard command once the caller adopts one, which only checks carries today.
- A calling job that grants `contents: write`, `pull-requests: write` and `actions: write` to the release pull request call.
- A calling job that grants `contents: write` and `id-token: write` to the publish call.
- Its `CI_RUNS_ON` repository variable when its release runs on its own runner.
  Every job in `release-pr.yml` and `release.yml` runs on `${{ vars.CI_RUNS_ON || 'ubuntu-latest' }}`, read in the caller's context.
  A caller that sets no `CI_RUNS_ON` runs every release job on `ubuntu-latest`.

## Runners and fork pull requests

A fork pull request never starts these jobs in a caller.
The caller's trigger files run them only on a manual run, a push to `main` and a tag push.
Each of those needs write access to the caller, which a fork author does not hold.
This repository keeps them out of a fork pull request's reach too.
Its `release-smoke.yml` calls `release-pr.yml` only on a manual run and on a push that edits `release-smoke.yml`.
The `release-guard` CI job starts that manual run on the head branch and waits for it.
A fork pull request runs with a read-only token, which cannot start the run, so `release-guard` fails there.
This repository sets no `CI_RUNS_ON`, so the run stands for a caller that sets none.
The `release-guard` CI job fails when the planning job of that run runs anywhere but `ubuntu-latest`.

## How this repository releases

This repository releases through its own two release runs, called by local path, like any caller.
The shared copies hold the names `release-pr.yml` and `release.yml`, so its trigger files are `.github/workflows/own-release-pr.yml` and `.github/workflows/own-release.yml`.
Each calls the shared copy from the same commit, so a release runs the release workflows it ships.

1. A manual run of `own-release-pr` opens or refreshes the release pull request through `checks-release-pr ci.yml`, after `checks-release-preflight own-release.yml` passes.
   It bumps `package.json` from the last release tag by the kit's rule, runs `bun run build`, and dispatches `ci.yml` on the release branch.
2. The release pull request merges on explicit word only.
3. The push of its `chore: release <version>` commit to `main` runs the `tag` job, which tags the commit through `checks-release-tag own-release.yml` and dispatches `own-release` on the tag.
4. `own-release` verifies the tag, then its `publish` job runs `bun release/major-tag.ts` and creates the release page from the version's `CHANGELOG.md` section.

`bun run build` runs `release/changelog.ts`, which writes the section of the version `package.json` holds from the conventional commits since the last release tag.
It groups them the way `checks-release-pr` reads them to pick the version, so the notes list the commits that chose it.
It dates the section with the release day in a `Released YYYY-MM-DD.` line.
It leaves every other section as it stands, so the sections written by hand before `package.json` held a version stay.
Once the version's own tag is the last release tag, it writes no new section, so the build on the tag leaves the tree clean.
It drops every section past the last release tag that is not the version `package.json` holds, so a cancelled release leaves no section behind.
On the landed release commit it keeps the recorded date and writes the subjects again.
A rebuild on another day leaves the tree clean.
A release pull request merged behind `main` still rewrites the changelog, so `checks-release-tag` refuses to tag it.
It refuses a version not past the last release tag and a version with no listed change since it.

`release/major-tag.ts` points the major tag, such as `v2`, at the commit the release tag names, through the GitHub API with the publish job's token.
It creates the major tag on the first release of a major.
It never moves the major tag back to an older tag once a newer release holds it.
The tag step dispatches `own-release` on the tag, so no pushed tag starts it.

GitHub refuses the release pull request until the repository turns on **Allow GitHub Actions to create and approve pull requests**, under its Actions settings.

## Related topics

- [The shared actions](actions.md)
- [The advisory scan](advisories.md)
- [The mutation runs](mutation.md)
- [The runner pick](runner.md)
- [Bump the pin with Dependabot](dependabot.md)
- [workflows](../README.md)
