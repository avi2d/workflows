#!/usr/bin/env bash
set -u

if [ -n "$CLOUDFLARE_API_TOKEN" ] && [ -n "$CLOUDFLARE_ACCOUNT_ID" ]; then
  echo "set=true" >> "$GITHUB_OUTPUT"
else
  echo "$MISSING_NOTE"
  echo "set=false" >> "$GITHUB_OUTPUT"
fi
