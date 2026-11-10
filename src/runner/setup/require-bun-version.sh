#!/usr/bin/env bash
# Without the file, setup-bun falls back to the latest Bun, so the version drifts silently.
if [ ! -f .bun-version ]; then
  echo "::error file=.bun-version::setup needs a .bun-version file at the repository root"
  exit 1
fi
