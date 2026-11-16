---
kind: reference
audience: consumers
---
# The shared CI

The shared CI is the set of reusable workflows that every site and every code repository calls from `@v3`.
Each one holds the steps its table row names, and every step in it is one plain command.
A caller either calls one whole workflow per event, or composes [the CI parts](#the-ci-parts) into one job per concern that run in parallel.
Each repository supplies its commands in `package.json` and each site supplies its names as workflow inputs.
`bunx checks-workflows --write` from the checks kit writes the caller files, and the first step of each checks job runs `bunx checks-workflows` to refuse a file that differs.

## The shared workflows

| Workflow | Called by | What it does |
| --- | --- | --- |
| `site-ci.yml` | a site's `ci.yml` | sets up, checks the workflow files and the title, builds, deploys the preview, posts its link, holds a draft, lints, typechecks, runs `checks-test --pr` and `checks-browser --pr`, and uploads `artifacts/` on every run that is not cancelled |
| `site-main.yml` | a site's `main.yml` | runs `checks-release-tag`, builds the site, deploys it to staging, and waits until staging serves it |
| `site-production.yml` | a site's `production.yml` | runs `checks-production-gate` on the staged commit, runs the full test suite and the pixel screenshots on it, builds it for production, publishes it, waits until the domain serves it, and audits the live site with Lighthouse |
| `preview-remove.yml` | a site's `preview-close.yml` | removes the closed pull request's preview |
| `ci.yml` | a code repository's `ci.yml` | holds a draft, sets up, checks the workflow files and the title, builds, lints, typechecks and runs `checks-test --pr` |
| `release-main.yml` | a code repository's `main.yml` | runs `checks-release-tag` with the npm registry set up, after `bun run test --full` on a release commit when `full-test` is true |
| `pr-title.yml` | every repository's `pr-title.yml` | checks the title and reports it as the `commitlint` status |
| `release-pr.yml` | every repository's `release.yml` | opens or refreshes the release pull request through `checks-release-pr ci.yml` |
| `flake.yml` | a code repository's `flake.yml` | runs `checks-flake --runs <runs> --report flake-report.json` in the heavy slot, and uploads `flake-report.json` on every run that is not cancelled |
| `github-pages.yml` | a repository's `docs.yml` | builds the site with the `build` command, uploads the `path` folder, and deploys it to GitHub Pages |

The kit decides what each command does on each event, so the jobs hold no condition on what to test.
`checks-release-tag` does nothing on a merge that is not a release commit.
On a release commit it checks the files equal the release pull request that passed, then creates the tag and the GitHub release.
A release deploy can land over a later merge deploy.
The production gate still refuses unless staging serves a published release, and the next merge to main puts staging back.
The production run tests the release commit before it publishes, so a red release commit never reaches production.

## The CI parts

Each part is one job with one purpose, and the caller's `ci.yml` names the parts it needs.
The parts run side by side, so a run takes as long as its slowest part rather than the sum of its steps.

| Part | Inputs | What its job does |
| --- | --- | --- |
| `changes.yml` | `paths` | tells through [docs-only](actions.md#docs-only) whether the pull request changes only documentation, as the `docs-only` output, and whether the run checks a release pull request, as the `release` output |
| `static.yml` | `hold`, `secrets-pack` | holds a draft, checks the workflow files and the title, writes the secrets pack when `secrets-pack` is true, runs source lint, builds, refuses a diff the build leaves, and typechecks |
| `test.yml` | `run`, `browsers`, `artifact`, `artifact-path`, `heavy`, `hold`, `runs-on` | runs the one command in `run`, by default `bunx checks-test --pr`, after it downloads the artifact, takes the heavy slot and installs the browsers it names, and uploads `artifacts/` on every run that is not cancelled |
| `site-preview.yml` | `pages`, `path` | builds the site, runs built-site lint, deploys the preview, posts its link, and uploads the build as the `site-dist` artifact |
| `gate.yml` | `results`, `skips` | fails through [require-success](actions.md#require-success) unless every needed job passed or skipped as `skips` allows |

`static.yml` and `test.yml` hold a draft by default through `hold`, and a caller sets `hold: false` on the jobs that start before the preview so a draft still gets its preview link.
A `test.yml` caller grants `actions: write`, since the draft hold cancels the run whatever `hold` is set to.
Each `test.yml` job keys its own browser cache, so parallel jobs never fight over one cache.
`runs-on` defaults to `ubuntu-latest`, and a caller that keeps its `CI_RUNS_ON` override passes `${{ vars.CI_RUNS_ON || 'ubuntu-latest' }}`.
The caller's `checks` job calls `gate.yml`, whose job is also `checks`, so branch protection still reads `checks / checks`.
The gate job needs `if: always()`, or a failed part skips the gate and the check never reports.

`changes.yml` sets `release` to `true` on a run dispatched on a `release/` branch, and on a pull request from `release/<base>` in the same repository.
On such a run it skips the setup and the docs-only check, and `docs-only` is `false`.
Every job that reads `docs-only` also reads `release`.
A caller with a `changes` job reads the output instead of writing the release rule into each job:

```yaml
  static:
    needs: changes
    if: needs.changes.outputs.release != 'true'
    uses: avi2d/workflows/.github/workflows/static.yml@v3
  test:
    needs: changes
    if: needs.changes.outputs.release != 'true' && needs.changes.outputs.docs-only != 'true'
    uses: avi2d/workflows/.github/workflows/test.yml@v3
  checks:
    needs: [changes, static, test]
    if: always()
    uses: avi2d/workflows/.github/workflows/gate.yml@v3
    with:
      results: ${{ toJSON(needs) }}
      skips: ${{ needs.changes.outputs.release == 'true' && 'static test' || needs.changes.outputs.docs-only == 'true' && 'test' || '' }}
```

The `changes` job then runs on every event, and `static` starts after it.
A caller that still writes the release rule on each job keeps working.

A site's composed `ci.yml`, where the browser tests read the build the preview job made:

```yaml
name: ci
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
  workflow_dispatch:
concurrency:
  group: ci-${{ github.event.pull_request.number || github.run_id }}
  cancel-in-progress: true
jobs:
  changes:
    uses: avi2d/workflows/.github/workflows/changes.yml@v3
    permissions: { contents: read }
  static:
    needs: changes
    if: needs.changes.outputs.release != 'true'
    uses: avi2d/workflows/.github/workflows/static.yml@v3
    permissions: { contents: read, actions: write, statuses: write, pull-requests: read }
    with:
      hold: "false"
  site:
    needs: changes
    if: needs.changes.outputs.release != 'true' && needs.changes.outputs.docs-only != 'true'
    uses: avi2d/workflows/.github/workflows/site-preview.yml@v3
    permissions: { contents: read, pull-requests: write }
    with:
      pages: "example-site"
    secrets:
      CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
  unit:
    needs: changes
    if: needs.changes.outputs.release != 'true' && needs.changes.outputs.docs-only != 'true'
    uses: avi2d/workflows/.github/workflows/test.yml@v3
    permissions: { contents: read, actions: write }
    with:
      hold: "false"
      runs-on: "${{ vars.CI_RUNS_ON || 'ubuntu-latest' }}"
  browser:
    needs: site
    uses: avi2d/workflows/.github/workflows/test.yml@v3
    permissions: { contents: read, actions: write }
    with:
      run: "bunx checks-browser --pr"
      browsers: "webkit"
      artifact: "site-dist"
      heavy: "true"
      runs-on: "${{ vars.CI_RUNS_ON || 'ubuntu-latest' }}"
  checks:
    needs: [changes, static, site, unit, browser]
    if: always()
    uses: avi2d/workflows/.github/workflows/gate.yml@v3
    permissions: { contents: read, statuses: write }
    with:
      results: ${{ toJSON(needs) }}
      skips: ${{ needs.changes.outputs.release == 'true' && 'static site unit browser' || needs.changes.outputs.docs-only == 'true' && 'site unit browser' || '' }}
```

A library's composed `ci.yml`:

```yaml
name: ci
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
  workflow_dispatch:
concurrency:
  group: ci-${{ github.event.pull_request.number || github.run_id }}
  cancel-in-progress: true
jobs:
  static:
    if: ${{ !((github.event_name == 'workflow_dispatch' && startsWith(github.ref_name, 'release/')) || (github.event_name == 'pull_request' && github.head_ref == format('release/{0}', github.base_ref) && github.event.pull_request.head.repo.full_name == github.repository)) }}
    uses: avi2d/workflows/.github/workflows/static.yml@v3
    permissions: { contents: read, actions: write, statuses: write, pull-requests: read }
  test:
    if: ${{ !((github.event_name == 'workflow_dispatch' && startsWith(github.ref_name, 'release/')) || (github.event_name == 'pull_request' && github.head_ref == format('release/{0}', github.base_ref) && github.event.pull_request.head.repo.full_name == github.repository)) }}
    uses: avi2d/workflows/.github/workflows/test.yml@v3
    permissions: { contents: read, actions: write }
    with:
      runs-on: "${{ vars.CI_RUNS_ON || 'ubuntu-latest' }}"
  checks:
    needs: [static, test]
    if: always()
    uses: avi2d/workflows/.github/workflows/gate.yml@v3
    permissions: { contents: read, statuses: write }
    with:
      results: ${{ toJSON(needs) }}
      skips: ${{ ((github.event_name == 'workflow_dispatch' && startsWith(github.ref_name, 'release/')) || (github.event_name == 'pull_request' && github.head_ref == format('release/{0}', github.base_ref) && github.event.pull_request.head.repo.full_name == github.repository)) && 'static test' || '' }}
```

`ci.yml` and `site-ci.yml` keep working for every caller that still calls them, and they stay until v4.

## The site files

A site caller passes its Cloudflare Pages project, live domain, and production repository to each site workflow.
[site-names](actions.md#site-names) derives the preview project and origins from those inputs.
A site's `ci.yml`:

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
    with:
      pages: azalialaw
      domain: azalialaw.com
      production: azalialaw/azalialaw.com
    secrets:
      CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

`ready_for_review` starts the run that [draft-hold](actions.md#draft-hold) held on the draft.
The callers of `site-main.yml`, `site-production.yml`, and `preview-remove.yml` also pass all three inputs.
The other site files call their shared workflow as follows:

| File | Trigger | Calls |
| --- | --- | --- |
| `pr-title.yml` | `pull_request` `edited` | `pr-title.yml` |
| `preview-close.yml` | `pull_request` `closed` | `preview-remove.yml` |
| `main.yml` | `push` to `main` | `site-main.yml` |
| `release.yml` | `workflow_dispatch` | `release-pr.yml` |
| `production.yml` | `workflow_dispatch` | `site-production.yml` |
| `advisories.yml` | by hand | `advisories.yml` |

## The code repository files

A code repository carries `ci.yml`, `pr-title.yml`, `main.yml` calling `release-main.yml`, and `release.yml` calling `release-pr.yml`.
`advisories.yml`, `mutation.yml` and `flake.yml` stay where a repository has them.
An `advisories.yml` caller keeps its own weekly `schedule` trigger.
A `flake.yml` caller starts by hand, grants `contents: read`, and may pass `runs` and `node-version-file`.
A `docs.yml` caller runs on a push to `main`, passes `build` and `path`, and grants `contents: read`, `pages: write` and `id-token: write`.
It leaves out a `concurrency` group named `github-pages-deploy`, which the shared workflow holds.
A code repository that publishes to npm passes `full-test: true` to `release-main.yml`, so its release commit runs the full suite once before the publish.
The suite runs when the pushed commit's message starts with `chore: release `, the subject of a release commit.

## What a caller supplies

- The `pages` and `path` inputs on each call to `site-preview.yml`.
- The permissions each calling job grants, which bound what the shared job holds.
- The secrets each calling job passes by name where the shared workflow declares them: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` for a site, `PRODUCTION_DEPLOY_KEY` for its production run, and `CHECKS_SECRETS_PACK` for a `static.yml` call with `secrets-pack: true`.
- Its `CI_RUNS_ON` repository variable when its jobs run on its own runner.
  A public caller leaves `CI_RUNS_ON` unset, so a fork pull request never runs on the self hosted runner.
- Its `HEAVY_SLOT_RUNNER_PREFIX` and `HEAVY_SLOT_COMMAND` repository variables when its machines hold a heavy slot, as [heavy-slot](actions.md#heavy-slot) takes them.
- The commands its `package.json` names: `build`, `lint` and `typecheck`, plus `build:site` for a site, and `build:production`, `test` and `test:pixel` for its production run, where `test` takes `--full`.
- A caller of the composed parts keeps its `lint` command to source files only and runs `checks-lint --stage source` beside its other source checks.
  A site keeps `"lint": "oxlint && checks-lint --stage source && bun scripts/check-article-copy.ts"` for example.
  The site job runs `checks-lint --stage built` after `build:site`.
- A caller of the single-job `site-ci.yml` or `ci.yml` keeps plain `checks-lint` in `lint`, which runs both stages after the build.
- A caller of the composed parts needs the `@avi2dg/checks` release `package.json` names, which is the first whose `checks-lint` takes `--stage`.

A called job reports its check as `<caller job> / <shared job>`, such as `checks / checks`, so branch protection names that check.
A pull request from a fork or from Dependabot runs without the repository secrets, so it gets no preview.
