#!/usr/bin/env bash
exec bash "${BASH_SOURCE[0]%/*}/../../src/gates/require-success/require-success.sh" "$@"
