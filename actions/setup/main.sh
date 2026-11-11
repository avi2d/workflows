#!/usr/bin/env bash
part="${1:-require-bun-version}"
case "$part" in
  require-bun-version | bun-without-unzip | bun-held)
    exec bash "${BASH_SOURCE[0]%/*}/$part.sh"
    ;;
  *)
    echo "::error::setup's main.sh takes require-bun-version, bun-without-unzip or bun-held, not '$part'"
    exit 1
    ;;
esac
