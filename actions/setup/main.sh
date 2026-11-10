#!/usr/bin/env bash
exec bash "${BASH_SOURCE[0]%/*}/../../src/runner/setup/require-bun-version.sh" "$@"
