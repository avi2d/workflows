#!/usr/bin/env bash
set -euo pipefail

HOSTS=(archive.ubuntu.com azure.archive.ubuntu.com security.ubuntu.com)
PORTS=(80 443)
RECORD="$RUNNER_TEMP/package-host-requests.log"

recorded() {
  local before
  before="$(wc -l < "$RECORD")"
  curl --silent --max-time 10 --output /dev/null "http://$1/" || true
  test "$(wc -l < "$RECORD")" -gt "$before"
}

case "${1:-}" in
  listen)
    printf '127.0.0.1 %s\n' "${HOSTS[@]}" >> /etc/hosts
    : > "$RECORD"
    for port in "${PORTS[@]}"; do
      # http.server prints its start line on stdout, and a record that held it would never be empty.
      nohup python3 -u -m http.server "$port" --bind 127.0.0.1 --directory "$(mktemp -d)" < /dev/null > /dev/null 2>> "$RECORD" &
    done
    ;;
  verify)
    if [ -s "$RECORD" ]; then
      echo "::error::the job asked an Ubuntu package host for:"
      cat "$RECORD"
      exit 1
    fi
    for host in "${HOSTS[@]}"; do
      for port in "${PORTS[@]}"; do
        if ! recorded "$host:$port"; then
          echo "::error::a request to $host:$port went unrecorded, so the empty record proves nothing"
          exit 1
        fi
      done
    done
    echo "package-hosts-smoke: the job asked no Ubuntu package host, and the listener records a request to each"
    ;;
  *)
    echo "::error::package-hosts-smoke takes listen or verify, not '${1:-}'"
    exit 1
    ;;
esac
