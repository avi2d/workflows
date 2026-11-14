#!/usr/bin/env bash
set -euo pipefail

case "$EVENT_NAME" in
  pull_request | pull_request_target) ;;
  *) echo "draft-hold: a $EVENT_NAME run is no push to a draft, so the checks run"; exit 0 ;;
esac
if [ "$DRAFT" != true ]; then
  echo "draft-hold: the pull request is ready for review, so the checks run"
  exit 0
fi
if [ "$RUN_ATTEMPT" != 1 ]; then
  echo "draft-hold: someone started attempt $RUN_ATTEMPT of this run by hand, so the checks run"
  exit 0
fi

# A skipped job reads as a passed check, and a cancelled one does not.
if ! gh api --method POST "repos/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID/cancel" > /dev/null; then
  echo "::warning::draft-hold could not cancel this run, so the checks run. Give the job actions: write to hold a draft's checks."
  exit 0
fi
echo "::notice::The pull request is a draft, so its checks wait. Re-run this run to start them by hand, or mark the pull request ready for review."
sleep "$WAIT_SECONDS"
# GitHub never stops a job whose if: is always(), so the hold fails it in place of a pass.
echo "::error::The pull request is a draft and this job outlived the cancel of its run, so the job fails. Re-run this run to start the checks by hand."
exit 1
