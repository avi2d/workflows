#!/usr/bin/env bash
# Returns 124 when bunx is still running after 180 seconds, with its whole process tree stopped.
# timeout alone leaves sudo's apt-get holding the dpkg lock.
set -u

descendants() {
  local child
  for child in $(pgrep -P "$1"); do
    echo "$child"
    descendants "$child"
  done
}

bunx "$@" &
pid=$!
for _ in $(seq 180); do
  if ! kill -0 "$pid" 2>/dev/null; then
    wait "$pid"
    exit $?
  fi
  sleep 1
done

mapfile -t tree < <(descendants "$pid")
tree+=("$pid")
sudo -n kill -KILL "${tree[@]}" 2>/dev/null || kill -KILL "${tree[@]}" 2>/dev/null || true
wait "$pid" 2>/dev/null || true
exit 124
