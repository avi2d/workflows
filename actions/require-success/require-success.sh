#!/usr/bin/env bash
set -u

read -rd '' -ra results <<< "$RESULTS" || true
if [ "${#results[@]}" -eq 0 ]; then
  echo "::error::require-success needs at least one name=result in results"
  exit 1
fi
failed=()
for pair in "${results[@]}"; do
  if [[ "$pair" != *=* ]]; then
    echo "::error::require-success takes name=result pairs, not '$pair'"
    exit 1
  fi
  if [ "${pair#*=}" != success ]; then
    failed+=("$pair")
  fi
done
if [ "${#failed[@]}" -gt 0 ]; then
  echo "::error::${failed[*]}, where each result must be success"
  exit 1
fi
echo "${results[*]}"
