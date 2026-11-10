#!/usr/bin/env bash
set -euo pipefail

case "${1:-}" in
  stub)
    mkdir -p "$RUNNER_TEMP/bin"
    cat > "$RUNNER_TEMP/bin/heavy-slot-stub" <<'EOF'
#!/bin/sh
echo "$1" >> "$RUNNER_TEMP/heavy-slot.log"
EOF
    chmod +x "$RUNNER_TEMP/bin/heavy-slot-stub"
    echo "$RUNNER_TEMP/bin" >> "$GITHUB_PATH"
    ;;
  verify)
    cat "$RUNNER_TEMP/heavy-slot.log"
    test "$(cat "$RUNNER_TEMP/heavy-slot.log")" = "$(printf 'acquire\nrelease')"
    test "$UNKNOWN" = failure
    ;;
  *)
    echo "::error::heavy-slot-smoke takes stub or verify, not '${1:-}'"
    exit 1
    ;;
esac
