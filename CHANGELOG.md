# Changelog

Every release of `workflows`, newest first.
The release pull request writes each new section from the conventional commits since the last release tag.

## 2.4.0

Released 2026-11-11.

### Features

- **actions:** add github-release, which creates or updates the GitHub release for a tag with its notes file, and marks the highest version as latest.
- **mutation:** pick the run from the caller's event when no mode is named. A caller that sends no mode now gets compare on a pull request, refresh on a manual start through `workflow_dispatch`, and no mutation job on a push to main. It no longer gets a baseline; only a named `baseline` runs one. A caller that sends a mode runs the same jobs as before.

### Fixes

- **playwright:** run the Playwright job in the Playwright image at the pinned playwright-core version, and fail the job if it reaches the Ubuntu package hosts. Setup fetches Bun through npm where the image holds no unzip, and apt-get runs only when a system package is missing.
- **ci:** install the mutation instrumenter before the no-mistakes lint, through the `install:instrumenter` script.
- **playwright:** run the stalled browser install in TypeScript, and remove `attempt.sh`. Inputs and outputs are unchanged.
- **docs-only:** classify the change in TypeScript instead of shell. Inputs and outputs are unchanged.

Every path a `v2.3.1` caller names still resolves, with no new required input. The `v2` tag moves to this release.

## 2.3.1

Released 2026-11-11.

### Fixes

- **mutation:** test static mutants in the refresh shards so a full run finishes, save the merged refresh report as the state a baseline starts from, seed an empty state from the last refresh, and drop the `workflow_dispatch` trigger from the shared workflow.

Every path a `v2.2.0` caller names still resolves, with no new required input. The `v2` tag moves to this release.

## 2.3.0

Released 2026-11-11.

### Features

- **actions:** add held-runs, which deletes the runs GitHub holds for approval on a release pull request, and run it from `release-pr.yml`.
- **mutation:** run the pull request mutation run without main, and end the compare run green on a skipped pull request.
- **actions:** make docs-only match the caller's paths, let require-success allow skipped jobs, and skip empty secrets-pack and head-status on the PR head.

Every path a `v2.2.0` caller names still resolves, with no new required input. The `v2` tag moves to this release.

## 2.2.0

Released 2026-11-11.

### Features

- **release:** run the release pull request and publish jobs on the caller's runner pick, and add the opt-in GitHub release with its `CHANGELOG.md` section as the release notes.
- **actions:** colocate each action's logic and tests with the action, so `actions/<name>` holds `action.yml` with the `main.ts` or `main.sh` its steps run.

### Fixes

- **release:** write the GitHub release notes before the publish command runs.

Every path a `v2.1.0` caller names still resolves, with no new required input. The `v2` tag moves to this release.

## 2.1.0

Released 2026-11-10.

### Features

- **release:** add the reusable release pull request and publish workflows, `.github/workflows/release-pr.yml` and `.github/workflows/release.yml`, and the release-version action that matches the tag to the manifest version.
- **actions:** add twelve site actions for staging, publishing and previews: pages-main-tip, pages-deploy, pages-staged-commit, pages-publish, pages-staging-address, preview-secrets-check, preview-address, preview-deploy, preview-comment, preview-remove, affected-tests and require-success. Each sits in a flat `actions/<name>` folder.

Every path a `v2.0.0` caller names still resolves, and the ten released actions keep their inputs and outputs. The `v2` tag moves to this release.

## 2.0.0

Released 2026-11-10.

### Breaking changes

- **actions:** move the composite actions from `<name>` at the repository root to `actions/<name>`, so callers write `avi2d/workflows/actions/<name>@v2`. The `v1` tags keep the root folders.

### Features

- **mutation:** add the reusable mutation runs in `.github/workflows/mutation.yml`, and the mutation and mutation-scope actions they run.
- **kit-bin:** share the kit command resolver, and scope compare runs by the pull request base.
- **actions:** give head-status a `head-sha` input, and add the secrets-pack action.

### Fixes

- **mutation:** count only scoped files in the compare count, cap the advisory comment under the GitHub body limit, and expose the shards output to the caller.

## 1.2.1

Released 2026-11-08.

### Fixes

- **advisories:** run the kit from source when the caller is the kit.

## 1.2.0

Released 2026-11-08.

### Features

- **advisories:** add the reusable weekly advisory scan in `.github/workflows/advisories.yml`.
- **setup:** cache the gitleaks the kit pins across CI runs.

## 1.1.2

Released 2026-11-07.

### Fixes

- **runner:** skip the hosted probe job when the caller sets `CI_RUNS_ON`, so the pick runs on the caller's own runner and spends no hosted minute.

## 1.1.1

Released 2026-11-06.

### Fixes

- **playwright:** stop install and install-deps after 3 minutes per try and retry up to 3 times, so a stalled download no longer holds a job until the runner limit. The commitlint status read retries too.

## 1.1.0

Released 2026-11-06.

### Features

- **actions:** move the composite actions from `actions/<name>` to `<name>` at the repository root, so callers write `avi2d/workflows/<name>@v1`. The Dependabot config reads the root folders in their place. `v1.0.0` keeps the `actions/` folder, so a SHA pin on it still resolves.
- **docs:** show callers a tag pin, `@v1` or an exact `@v1.x.y`, in place of a full commit SHA. The `v1` tag moves to each new `v1.x.y` release, and an exact tag never moves. A SHA pin still works, with the tag in a trailing comment.
