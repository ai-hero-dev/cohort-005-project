#!/usr/bin/env bash
# Logs in as three seeded users (one admin, one instructor, one student) via
# the app's own DevUI "Switch user" panel and screenshots /dashboard for each.
#
# Requires: agent-browser (installed + `agent-browser install` already run),
# the app running and reachable at $APP_URL, and data.db already migrated +
# seeded (so the three users below exist).
set -euo pipefail

APP_URL="${APP_URL:-http://localhost:5173}"
OUT_DIR="${OUT_DIR:-screenshots}"

# Isolate from any other agent-browser session that might be sharing this
# machine's daemon (harmless on an ephemeral GitHub Actions runner, but keeps
# local dry runs from colliding with other work too).
export AGENT_BROWSER_SESSION="${AGENT_BROWSER_SESSION:-cohort005-frontend-poc}"

mkdir -p "$OUT_DIR"

# One fixture user per role, picked from scripts/seed.ts's hand-written
# (non-generated) users so the name shown in the sidebar is stable run over
# run. Format: <display name>|<role, used only for the filename>
USERS=(
  "Alex Rivera|admin"
  "Sarah Chen|instructor"
  "Emma Wilson|student"
)

echo "Waiting for $APP_URL to respond..."
for i in $(seq 1 60); do
  if curl -sf -o /dev/null "$APP_URL/dashboard"; then
    echo "App is up."
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "App never became ready at $APP_URL" >&2
    exit 1
  fi
  sleep 1
done

index=1
for entry in "${USERS[@]}"; do
  name="${entry%%|*}"
  role="${entry##*|}"
  slug="$(echo "$name" | tr '[:upper:] ' '[:lower:]-')"
  file="$(printf '%02d-%s-%s.png' "$index" "$role" "$slug")"

  echo "=== [$index/3] Switching user -> $name ($role) ==="

  # Fresh load of the dashboard. On the very first iteration there is no
  # session cookie yet, so the loader 401s and the route's own ErrorBoundary
  # renders "Select a user from the DevUI panel" -- but the DevUI panel
  # itself lives in the parent layout route, so it's still on the page.
  agent-browser open "$APP_URL/dashboard"
  agent-browser wait --load networkidle

  agent-browser find role button click --name "Switch user"
  agent-browser wait 300
  agent-browser find text "$name" click --exact

  # The switch-user form redirects back to /dashboard and re-runs loaders;
  # wait for the newly-selected name to show up in the sidebar rather than
  # for a URL change, since the URL doesn't actually change.
  agent-browser wait --load networkidle
  agent-browser wait --text "$name"

  agent-browser screenshot "$OUT_DIR/$file" --full
  echo "Saved $OUT_DIR/$file"

  index=$((index + 1))
done

agent-browser close

echo "Done. Screenshots:"
ls -la "$OUT_DIR"
