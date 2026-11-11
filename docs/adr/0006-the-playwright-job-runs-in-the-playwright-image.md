---
governs: [actions/playwright/action.yml, .github/workflows/ci.yml]
---
# 0006. The playwright job runs in the Playwright image

Date: 2026-11-11

## Status

Accepted.

## Context

On a bare GitHub-hosted runner webkit misses system packages, and `playwright-core install-deps` fetches them with `apt-get` from `archive.ubuntu.com`, `azure.archive.ubuntu.com` and `security.ubuntu.com`.
From 2026-11-06 to 2026-11-11 the playwright job of this repository's CI ran 116 times over 106 workflow runs.
98 passed, 15 failed and 3 were cancelled.
All 15 failures and 2 of the cancellations stopped in that `apt-get` call, on 4 of the 6 days.
On 2026-11-11 the hosts gave no answer in 9 jobs over 3 runs: 8 logged `Temporary failure resolving` for all three hosts, and the first waited about 40 seconds on each index request to `azure.archive.ubuntu.com`.
On 2026-11-09 and 2026-11-10 the download of 181 packages from `azure.archive.ubuntu.com` outlasted every 180-second attempt in 5 jobs, at 87.8 kB/s in the one attempt where `apt-get` printed a rate.
On 2026-11-06 the same download stalled in 3 jobs: 1 failed, and 2 ran into the 15-minute job limit and were cancelled.
The third cancellation ended after one minute and left no log.
The retry wrapper bounds how long a job waits, and cannot make the hosts answer.

Three ways were measured against that record.
The runner image holds no webkit packages: `ubuntu-26.04` installs 139 MB of them per job.
An Actions cache of the packages still needs the hosts on every miss, and a restore of 181 packages has to keep `dpkg` state in step with a runner image that changes weekly.
The image `mcr.microsoft.com/playwright` holds the browsers and every system package of one `playwright-core` version, in about 1 GB that the runner pulls from the Microsoft registry.

Inside that image `install-deps` still ran `apt-get update` first, and failed when the hosts did not answer, although no package was missing.

## Decision

The playwright action asks `playwright-core install-deps --dry-run` first, and runs `apt-get` only when that does not print `All system dependencies are installed.`.
The playwright job of this repository's CI runs in the Playwright image of the pinned `playwright-core` version, pinned by digest.
That job points the three hosts at a local listener and fails when the listener records a request.
setup fetches Bun through `npm` where the image holds no `unzip`, because `setup-bun` needs `unzip` and the Playwright image has none.
The action takes no input that picks the image, since a composite action cannot place its caller's job in a container.

## Consequences

A caller on a bare runner sees the same steps and the same `apt-get` call as before, after one dry run.
A caller stops needing the Ubuntu package hosts by adding `container:` with the image of its own `playwright-core` version to the job.
A `playwright-core` bump moves the image tag and digest in `ci.yml` with it, or the job downloads browsers the image does not hold.
The job pulls about 1 GB per run in place of the `apt-get` download.
A self-hosted runner skips the system package step as before.
