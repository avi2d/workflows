#!/usr/bin/env bash
exec bash "${BASH_SOURCE[0]%/*}/../../src/preview/preview-secrets-check/check.sh" "$@"
