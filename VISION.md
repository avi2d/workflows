# Vision

workflows exists so that every repository calls one shared copy of each CI step instead of keeping its own.
It serves every avi2d and azalialaw repository, public or private, that calls its composite actions or its reusable workflows.
It owns one thing: the composite actions that run inside the caller's job, with the runner pick and the advisory scan beside them.

## The caller keeps its job, and the shared copy keeps its steps

A composite action runs as steps inside the caller's job, so a caller composes shared steps while its workflow files stay its own.
The gates a job runs ship in the `@avi2dg/checks` kit, so this repository never duplicates what the kit already decides.

## Private settings arrive per call, and never live here

A private setting reaches the shared code only as an input, a named secret, or a repository variable, so the public copy stays free of anything private.
The shared steps cannot see the caller's secret store, so each secret is passed in as an input on the calling line.

## The major tag moves, and each dotted tag stays frozen

Callers tracking the major tag take each release as it lands, while callers naming a dotted tag stay on one fixed version.

## The only schedule is the advisory scan

Each supported repository runs its weekly advisory check through the shared workflow rather than its own.
Nothing else here runs on a schedule, so each new automation must earn its place beside the single scan.

## Scope

Private credentials, runner labels and customer data live with the caller, and never in this public copy.
Job gates belong to the checks kit, and workflow files belong to each caller.
It never places a public caller's jobs on a self-hosted runner, since that placement stays the private caller's choice.

A change aligns when it retires a copy every caller would otherwise keep, carries one more private setting as an input, or lets the shared steps do more while each caller's job stays its own.
A change should be resisted when it stores anything private, duplicates what the kit decides, takes a caller's workflow files into shared hands, schedules anything beside the scan, or puts a public job on a private runner.
