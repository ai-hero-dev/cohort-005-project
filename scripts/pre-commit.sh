#!/bin/sh
# Runs every pre-commit check in parallel. The budget is three seconds, so
# typecheck and boundaries use caches in node_modules/.cache. Tests stay in
# `npm run check`: the suite will soon outgrow the budget.
# lint-staged runs with --no-stash: its checks never write, and stashing would
# change the working tree under the checks running beside it.

logs=$(mktemp -d)
trap 'rm -rf "$logs"' EXIT

run() {
  name=$1
  shift
  ("$@" >"$logs/$name.log" 2>&1 || touch "$logs/$name.failed") &
}

run lint-staged npx lint-staged --no-stash --no-hide-partially-staged
run typecheck npm run --silent typecheck
run boundaries npm run --silent lint:boundaries
wait

status=0
for failed in "$logs"/*.failed; do
  [ -e "$failed" ] || continue
  name=$(basename "$failed" .failed)
  echo "✖ $name failed:"
  cat "$logs/$name.log"
  echo
  status=1
done
exit $status
