---
kind: reference
audience: consumers
---
# Repository layout

Repository layout is where each path in this repository lives.

## Paths

| Path | What it holds |
| --- | --- |
| `actions/<name>/` | the composite actions, one flat directory each, holding `action.yml`, the `main.ts` or `main.sh` its steps run, and the TypeScript and shell files that entry calls |
| `lib/` | the code more than one action shares |
| `ci/` | the smoke scripts the CI jobs run, in place of code inside `own-ci.yml`, where [The shared actions](actions.md) names the three that stay shell |
| `release/` | the TypeScript this repository's own release runs: the changelog build and the major tag move |
| `tests/unit/`, `tests/e2e/` | the tests, under `actions/<name>/`, `lib/`, `ci/`, `release/` and `workflows/` for the code they test |
| `.github/workflows/runner.yml` | the reusable runner pick |
| `.github/workflows/advisories.yml` | the reusable advisory scan, which also scans this repository weekly |
| `.github/workflows/mutation.yml` | the reusable mutation runs |
| `.github/workflows/` | the shared CI from `v3` on, as [The shared CI](shared-ci.md) lists it, beside the files below |
| `.github/workflows/release-pr-v2.yml` | the `v2` reusable release pull request, plan on dispatch and tag on merge |
| `.github/workflows/release-smoke.yml` | the release pull request smoke, manual and push on edit |
| `.github/workflows/release.yml` | the reusable release publish, guards then the caller publish command and the opt-in GitHub release |
| `.github/workflows/own-release-pr.yml`, `.github/workflows/own-release.yml` | this repository's own release, calling the two release runs by local path |
| `.github/workflows/own-ci.yml`, `.github/workflows/own-pr-title.yml` | this repository's CI, with actionlint and a smoke job for each action that has one, and its title check |
| `.github/dependabot.yml` | the weekly bump of the actions this repository pins |

## Related topics

- [The shared CI](shared-ci.md)
- [The shared actions](actions.md)
- [workflows](../README.md)
