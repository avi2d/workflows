#!/usr/bin/env bash
set -euo pipefail
bash <(curl -sSfL https://raw.githubusercontent.com/rhysd/actionlint/914e7df21a07ef503a81201c76d2b11c789d3fca/scripts/download-actionlint.bash) 1.7.12 "$RUNNER_TEMP"
"$RUNNER_TEMP/actionlint" -color
