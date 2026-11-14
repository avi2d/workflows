---
kind: reference
audience: consumers
---
# The runner pick

The runner pick is the reusable workflow `.github/workflows/runner.yml`, whose `runs-on` output names the runner a caller's jobs run on.

## Output

| Output | Value |
| --- | --- |
| `runs-on` | The caller's `CI_RUNS_ON` variable when it is set, else `ubuntu-latest` |

GitHub reads `vars` from the caller's repository and always assigns and bills a called workflow's hosted runners in the caller's context.
So `CI_RUNS_ON` is the caller's own label, and the caller's jobs run on the caller's own runners, whatever owner the caller has.
A caller that sets `CI_RUNS_ON` gets that label after one pick job on the caller's own runner.
A caller without `CI_RUNS_ON` gets `ubuntu-latest` after one hosted probe job.

## Holding a draft's checks

The pick takes one input:

| Input | Default | What it sets |
| --- | --- | --- |
| `draft-hold` | `false` | whether the pick cancels the run a push to a draft pull request started |

A caller that holds its checks through the pick makes three edits: the `ready_for_review` event type, `with: draft-hold: true` on its runner job, and `actions: write` on that one calling job:

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
jobs:
  runner:
    uses: avi2d/workflows/.github/workflows/runner.yml@v2
    with:
      draft-hold: true
    permissions:
      actions: write
  checks:
    needs: runner
    runs-on: ${{ needs.runner.outputs.runs-on }}
    steps:
      - run: bun run test
```

Keep the preview in its own workflow file with the input off, because the cancel stops every job of the run that has not finished.
The pick requests no permission the caller did not grant, so a caller that passes no input and grants nothing keeps working exactly as today.
The input works from the release that carries the action: the hold job runs only when a caller sets the input, so a caller that leaves the input off never resolves the reference.
On a draft push the required check shows cancelled, or failed where the required check is an `always()` gate job, and after a re-run by hand or after the draft turns ready it shows the checks result.
The hold job runs only on the first attempt of a draft pull request run, so other runs bill nothing extra.

## Costs

- A caller that sets `CI_RUNS_ON` sees the probe job as skipped, never as failed, and the pick bills it no hosted minute.
- A caller that sets `CI_RUNS_ON` holds one of its own runners for one pick job on every run.
- The pick always runs one job, so jobs that need the runner pick still run when the probe is skipped.
- A caller with `CI_RUNS_ON` runs on its own runners even while hosted minutes remain.
- A caller without `CI_RUNS_ON` pays one rounded up hosted minute for the probe in each workflow run.
- A caller without `CI_RUNS_ON` that runs out of hosted minutes sees the probe as a failed job, because GitHub refuses it before any step runs.
- `continue-on-error` keeps that refused probe off the caller's result, and the caller's own hosted jobs are refused the same way.
- This repository's CI does not call the pick, because a pull request from a fork could edit it to run on a `CI_RUNS_ON` runner.
- Its release smoke reads `CI_RUNS_ON` only in a manual run a fork pull request cannot start, as [The release runs](release.md#runners-and-fork-pull-requests) says.
- Only a run in a caller proves the pick.

## Related topics

- [The shared actions](actions.md)
- [The advisory scan](advisories.md)
- [The mutation runs](mutation.md)
- [The release runs](release.md)
- [workflows](../README.md)
