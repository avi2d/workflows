#!/usr/bin/env bash
set -uo pipefail

paths_verdict() {
  if [ -z "${BASE_SHA:-}" ]; then
    echo false
    return
  fi
  local merge_base changed
  merge_base=$(git merge-base "$BASE_SHA" "$HEAD_REF") || return 1
  # Without --no-renames a file moved into docs/ would list only its new path.
  changed=$(git -c core.quotePath=false diff --no-renames --name-only "$merge_base" "$HEAD_REF") || return 1
  if [ -z "$changed" ]; then
    echo false
    return
  fi
  local -a patterns
  read -rd '' -ra patterns <<< "$PATHS" || true
  shopt -s nocasematch
  local path pattern matched
  while IFS= read -r path; do
    matched=false
    for pattern in "${patterns[@]}"; do
      if [[ $path == $pattern ]]; then
        matched=true
        break
      fi
    done
    if [ "$matched" = false ]; then
      echo "docs-only: $path matches none of $PATHS" >&2
      echo false
      return
    fi
  done <<< "$changed"
  echo true
}

if [ -z "${PATHS:-}" ]; then
  # An empty base passes no range, and checks-docs-only then reports false.
  checks-docs-only ${BASE_SHA:+"$BASE_SHA" "$HEAD_REF"} >> "$GITHUB_OUTPUT"
  exit
fi
verdict=$(paths_verdict) || exit 1
echo "docs-only=$verdict" | tee -a "$GITHUB_OUTPUT"
