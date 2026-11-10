#!/usr/bin/env bash
exec bash "${BASH_SOURCE[0]%/*}/../../../src/preview/cloudflare-secrets-check/check.sh" "$@"
