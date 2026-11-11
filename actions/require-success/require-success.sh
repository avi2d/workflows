#!/usr/bin/env bash
set -u

read -rd '' -ra results <<< "$RESULTS" || true
read -rd '' -ra skips <<< "${SKIPS:-}" || true
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
  result=${pair#*=}
  if [ "$result" = skipped ] && [[ " ${skips[*]-} " == *" ${pair%%=*}=true "* ]]; then
    continue
  fi
  if [ "$result" != success ]; then
    failed+=("$pair")
  fi
done
if [ "${#failed[@]}" -gt 0 ]; then
  echo "::error::${failed[*]}, where each result must be success"
  exit 1
fi
echo "${results[*]}"
