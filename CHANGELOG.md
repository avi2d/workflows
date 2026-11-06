# Changelog

Every release of `workflows`, newest first.

## 1.1.0

Released 2026-11-06.

### Features

- **actions:** move the composite actions from `actions/<name>` to `<name>` at the repository root, so callers write `avi2d/workflows/<name>@v1`. The Dependabot config reads the root folders in their place. `v1.0.0` keeps the `actions/` folder, so a SHA pin on it still resolves.
- **docs:** show callers a tag pin, `@v1` or an exact `@v1.x.y`, in place of a full commit SHA. The `v1` tag moves to each new `v1.x.y` release, and an exact tag never moves. A SHA pin still works, with the tag in a trailing comment.
