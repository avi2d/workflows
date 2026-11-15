# Vision

workflows exists so that every repository calls one shared copy of each CI step instead of keeping its own.
It serves every repository its owners hold, public or private, that calls its composite actions or its reusable workflows.
It owns one thing: the shared workflows every repository's workflow files call, and the composite actions their steps run.

## Each workflow file calls one shared workflow, which keeps every step

A repository's workflow file is a short caller of one shared workflow, so every repository of a kind runs the same job.
One event runs one job, and no step runs twice.
What differs between repositories lives in each one's `package.json` commands, not in its workflow files.
The gates a job runs ship in the `@avi2dg/checks` kit, so this repository never duplicates what the kit already decides.

## Private settings arrive per call, and never live here

A private setting reaches the shared code only as an input, a named secret, or a repository variable, so the public copy stays free of anything private.
The shared steps cannot see the caller's secret store, so each secret is passed in by the caller.

## The major tag moves, and each dotted tag stays frozen

Callers tracking the major tag take each release as it lands, while callers naming a dotted tag stay on one fixed version.

## The only schedule is the advisory scan

Each supported repository runs its weekly advisory check through the shared workflow rather than its own.
Nothing else here runs on a schedule, so each new automation must earn its place beside the single scan.

## Scope

Private credentials, runner labels and customer data live with the caller, and never in this public copy.
Job gates belong to the checks kit, which also writes each caller's workflow files and refuses one that differs.
It never places a public caller's jobs on a self-hosted runner, since that placement stays the private caller's choice.

A change aligns when it retires a copy every caller would otherwise keep, or when it carries one more private setting as an input.
It also aligns when it lets the shared steps do more while each caller's workflow files stay short callers.
A change should be resisted when it stores anything private or duplicates what the kit decides.
Resist it as well when it gives a caller's workflow file a step of its own.
Resist it too when it schedules anything beside the scan or puts a public job on a private runner.
