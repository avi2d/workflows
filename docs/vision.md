# Vision

workflows is the shared GitHub Actions plumbing that the avi2d repositories call from their own workflows.

## Purpose

workflows exists so that each avi2d repository calls one shared copy of its CI steps rather than keeping its own.

## Serves

Every avi2d and azalialaw repository, public or private, whose CI calls its composite actions or its reusable workflows.

## Owns

The composite actions at the root, which run as steps inside the caller's job, and the reusable runner pick and advisory scan.
Its edge is the caller's job: the gates a job runs ship in the `@avi2dg/checks` kit, and each caller keeps its own workflow files.

## Non-goals

- It holds no secret, no runner name and no customer data.
- It does not put a public caller's jobs on a self-hosted runner.
- It offers no scheduled job but the weekly advisory scan.

## Direction

- Each repository the scan supports runs its weekly advisory scan through the shared advisories workflow rather than its own.

## Constraints

- The repository is public, so a private setting arrives only as an input, a secret or a repository variable.
- A composite action cannot read the caller's secrets, so each secret arrives as an input the caller writes.
- A `v1.x.y` tag never moves, and `v1` moves to the newest release.
