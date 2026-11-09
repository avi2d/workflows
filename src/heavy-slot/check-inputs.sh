#!/usr/bin/env bash
# GitHub does not enforce required inputs, and an empty prefix would match every runner.
set -u

case "$ACTION" in
  acquire | release) ;;
  *) echo "::error::action must be acquire or release, not '$ACTION'"; exit 1 ;;
esac
if [ -z "$RUNNER_PREFIX" ] || [ -z "$COMMAND" ]; then
  echo "::error::heavy-slot needs runner-prefix and command"
  exit 1
fi
