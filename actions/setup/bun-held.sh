#!/usr/bin/env bash
# A Bun the job already holds stays first on the PATH, where setup-bun would put this repository's pinned Bun ahead of the caller's.
if command -v bun > /dev/null; then
  echo "held=true" >> "$GITHUB_OUTPUT"
else
  echo "held=false" >> "$GITHUB_OUTPUT"
fi
