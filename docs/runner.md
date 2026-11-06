---
kind: reference
audience: consumers
---
# The runner pick

The runner pick is the reusable workflow `.github/workflows/runner.yml`, whose `runs-on` output names the runner a caller's jobs run on.

## Output

| Output | Value |
| --- | --- |
| `runs-on` | `ubuntu-latest` when GitHub starts the hosted probe job, else the caller's `CI_RUNS_ON` variable, else `ubuntu-latest` |

Billing is readable only with organization admin scope, so the pick reads the free minutes by whether GitHub starts its one hosted job.
A job GitHub refuses for want of minutes fails at once instead of queueing.
GitHub always assigns and bills a called workflow's hosted runners in the caller's context, and reads `vars` from the caller's repository.
So the probe spends the caller's minutes, and `CI_RUNS_ON` is the caller's own label.
The caller's jobs then run on the caller's own runners, whatever owner the caller has.

## Costs

- The probe bills one rounded up hosted minute for each workflow run while minutes remain.
- A refused probe shows as a failed job in the run, although `continue-on-error` keeps it off the caller's result.
- A hosted outage looks the same as an empty minutes balance, and both fall back to `CI_RUNS_ON`.
- This repository's CI proves only the hosted answer, because GitHub always starts its probe.

## Related topics

- [The shared actions](actions.md)
- [workflows](../README.md)
