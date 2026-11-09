#!/usr/bin/env bash
# An empty base passes no range, and checks-docs-only then reports false.
set -u
bunx checks-docs-only ${BASE_SHA:+"$BASE_SHA" "$HEAD_REF"} >> "$GITHUB_OUTPUT"
