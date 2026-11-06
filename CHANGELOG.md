# Changelog

Every release of `workflows`, newest first.

## 1.1.0 - 2026-11-06

### Changed

- The composite actions moved from `actions/<name>` to `<name>` at the repository root, so callers write `avi2d/workflows/<name>@v1`. Release 1.1.0 has no `actions/` folder; `v1.0.0` keeps it.
- The docs show a tag pin, `@v1` or an exact `@v1.x.y`, in place of a full commit SHA. A SHA pin still works, with the tag in a trailing comment.
- The `v1` tag moves to each new `v1.x.y` release. An exact `v1.x.y` tag never moves.
- The Dependabot config reads the root folders in place of `actions/*`.

### Unchanged

- The inputs, outputs and behaviour of every action, and the runner pick at `.github/workflows/runner.yml`.
- `v1.0.0`, so a SHA pin on `avi2d/workflows/actions/<name>` at a 1.0.0 commit keeps working.
