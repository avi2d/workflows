---
kind: reference
audience: consumers
---
# The shared CI

The shared CI is the set of reusable workflows that every site and every code repository calls from `@v3`.
Each one runs one job, and every step in it is one plain command.
What differs between repositories lives in each one's `package.json` commands.
`bunx checks-workflows --write` from the checks kit writes the caller files, and the first step of each checks job runs `bunx checks-workflows` to refuse a file that differs.

## The shared workflows

| Workflow | Called by | What its one job does |
| --- | --- | --- |
| `site-ci.yml` | a site's `ci.yml` | sets up, checks the workflow files and the title, builds, deploys the preview, holds a draft, lints, typechecks, runs `checks-test --pr` and `checks-browser --pr`, and uploads `artifacts/` on a failure |
| `site-main.yml` | a site's `main.yml` | builds the site, deploys it to staging, waits until staging serves it, then runs `checks-release-tag` |
| `site-production.yml` | a site's `production.yml` | runs `checks-release-gate` on the staged commit, builds it for production, publishes it, waits until the domain serves it, and audits the live site with Lighthouse |
| `preview-remove.yml` | a site's `preview-close.yml` | removes the closed pull request's preview |
| `ci.yml` | a code repository's `ci.yml` | holds a draft, sets up, checks the workflow files and the title, builds, lints, typechecks and runs `checks-test --pr` |
| `release-main.yml` | a code repository's `main.yml` | runs `checks-release-tag` with the npm registry set up |
| `pr-title.yml` | every repository's `pr-title.yml` | checks the title and reports it as the `commitlint` status |
| `release-pr.yml` | every repository's `release.yml` | opens or refreshes the release pull request through `checks-release-pr ci.yml` |

The kit decides what each command does on each event, so the jobs hold no condition on what to test.
`checks-release-tag` does nothing on a merge that is not a release commit.
On a release commit it checks the files equal the release pull request that passed, then creates the tag and the GitHub release.
Production runs no tests again.

## The site files

A site's `package.json` names the site:

```json
"site": { "pages": "azalialaw", "domain": "azalialaw.com", "production": "azalialaw/azalialaw.com" }
```

[site-names](actions.md#site-names) reads it, so the two sites carry byte-identical workflow files.
Its `ci.yml`:

```yaml
name: ci
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
  workflow_dispatch:
concurrency:
  group: ci-${{ github.event.pull_request.number || github.run_id }}
  cancel-in-progress: true
permissions:
  contents: read
jobs:
  checks:
    permissions:
      contents: read
      actions: write
      statuses: write
      pull-requests: write
    uses: avi2d/workflows/.github/workflows/site-ci.yml@v3
    secrets: inherit
```

`ready_for_review` starts the run that [draft-hold](actions.md#draft-hold) held on the draft.
The other site files call their shared workflow the same way:

| File | Trigger | Calls |
| --- | --- | --- |
| `pr-title.yml` | `pull_request` `edited` | `pr-title.yml` |
| `preview-close.yml` | `pull_request` `closed` | `preview-remove.yml` |
| `main.yml` | `push` to `main` | `site-main.yml` |
| `release.yml` | `workflow_dispatch` | `release-pr.yml` |
| `production.yml` | `workflow_dispatch` | `site-production.yml` |
| `advisories.yml` | by hand | `advisories.yml` |

## The code repository files

A code repository carries `ci.yml`, `pr-title.yml`, `main.yml` calling `release-main.yml`, and `release.yml`.
`advisories.yml`, `mutation.yml` and `flake.yml` stay where a repository has them.

## What a caller supplies

- The permissions each calling job grants, which bound what the shared job holds.
- `secrets: inherit` where the shared workflow declares secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` for a site, and `PRODUCTION_DEPLOY_KEY` for its production run.
- Its `CI_RUNS_ON` repository variable when its jobs run on its own runner.
  A public caller leaves `CI_RUNS_ON` unset, so a fork pull request never runs on the self hosted runner.
- Its `HEAVY_SLOT_RUNNER_PREFIX` and `HEAVY_SLOT_COMMAND` repository variables when its machines hold a heavy slot, as [heavy-slot](actions.md#heavy-slot) takes them.
- The commands its `package.json` names: `build`, `lint` and `typecheck`, plus `build:site` for a site and `build:production` for its production run.

A called job reports its check as `<caller job> / <shared job>`, such as `checks / checks`, so branch protection names that check.
A pull request from a fork or from Dependabot runs without the repository secrets, so it gets no preview.
