#!/usr/bin/env bash
# A Bun the job already holds stays first on the PATH, where setup-bun would put this repository's pinned Bun ahead of the caller's.
# command -v also finds a stand-in that only hands the call elsewhere, so the check runs bun.
if bun --version > /dev/null 2>&1; then
  echo "held=true" >> "$GITHUB_OUTPUT"
else
  echo "held=false" >> "$GITHUB_OUTPUT"
fi
version="$(< "${BASH_SOURCE[0]%/*}/../../.bun-version")"
echo "version=$version" >> "$GITHUB_OUTPUT"
