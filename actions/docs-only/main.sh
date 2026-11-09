#!/usr/bin/env bash
exec bash "${BASH_SOURCE[0]%/*}/../../src/docs-only/classify.sh" "$@"
