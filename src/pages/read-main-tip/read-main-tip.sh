#!/usr/bin/env bash
set -euo pipefail

sha=$(gh api "repos/$REPOSITORY/commits/$BRANCH" --jq .sha)
if ! [[ "$sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "::error::$REPOSITORY $BRANCH names no commit: '$sha'"
  exit 1
fi
echo "$REPOSITORY $BRANCH points at $sha"
echo "sha=$sha" >> "$GITHUB_OUTPUT"
