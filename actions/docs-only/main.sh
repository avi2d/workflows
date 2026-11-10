#!/usr/bin/env bash
exec bash "${BASH_SOURCE[0]%/*}/../../src/gates/docs-only/classify.sh" "$@"
