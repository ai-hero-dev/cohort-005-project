#!/usr/bin/env bash
# Logs in as three seeded users (one admin, one instructor, one student) via
# the app's own DevUI "Switch user" panel, and for each one records what
# /dashboard looks like: a screenshot, and a set of answers read back out of
# the live DOM.
#
# The screenshot is for a human. The answers are for an agent — a screenshot
# is pixels, and an agent that writes a fix needs a yes or a no.
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
  # No -f here: /dashboard legitimately 401s until a user is selected, and
  # -f would treat that as "not ready" and loop until timeout even though
  # the server answered fine. Any HTTP response at all means it's up.
  if curl -s -o /dev/null "$APP_URL/dashboard"; then
    echo "App is up."
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "App never became ready at $APP_URL" >&2
    exit 1
  fi
  sleep 1
done

# On a fresh checkout (no node_modules/.vite cache -- every CI run) the
# *first* browser load of the app discovers dependencies Vite hasn't
# pre-bundled yet. Vite re-optimizes them and pushes a full-page reload over
# its HMR websocket a moment *after* the initial response finishes loading
# -- past the point a single `wait --load networkidle` has already
# resolved. That reload was landing mid-interaction below (every click
# during the real per-user loop silently no-opped against a page that was
# about to navigate away), which is what "Element not found" actually was.
# Absorb the reload here, once, against a throwaway load, instead of
# fighting it inside the timed loop.
echo "Priming the Vite dev server (first load may trigger a dependency-optimizer reload)..."
agent-browser open "$APP_URL/dashboard"
agent-browser wait --load networkidle
agent-browser wait 1500
agent-browser wait --load networkidle

# ─── Asking the page a question ───
#
# `agent-browser eval` runs one expression in the page and prints what it
# returns. That is the whole extension over the original screenshot script:
# the agent stops guessing from an image and reads the DOM instead.
#
# ask <question> <expression>  -> "question: answer", to stdout and the file.
report=""
ask() {
  local question="$1" expression="$2" answer
  answer="$(agent-browser eval "$expression" 2>/dev/null | tr -d '\r')"
  echo "  $question: $answer"
  report="${report}${question}: ${answer}"$'\n'
}

index=1
for entry in "${USERS[@]}"; do
  name="${entry%%|*}"
  role="${entry##*|}"
  slug="$(echo "$name" | tr '[:upper:] ' '[:lower:]-')"
  file="$(printf '%02d-%s-%s' "$index" "$role" "$slug")"

  echo "=== [$index/3] Switching user -> $name ($role) ==="

  # Fresh load of the dashboard. On the very first iteration there is no
  # session cookie yet, so the loader 401s and the route's own ErrorBoundary
  # renders "Select a user from the DevUI panel" -- but the DevUI panel
  # itself lives in the parent layout route, so it's still on the page.
  agent-browser open "$APP_URL/dashboard"
  agent-browser wait --load networkidle

  # React hydration can lag behind "networkidle" on a loaded CI runner: the
  # "Switch user" button already exists in the server-rendered HTML before
  # React attaches its onClick, so the very first click can be a silent
  # no-op -- no error, the dropdown (which only exists in the DOM once
  # React's `open` state flips) just never renders. A fixed wait can't tell
  # the difference between "still hydrating" and "actually open", so poll
  # for the dropdown's real effect instead, re-clicking if it hasn't
  # appeared yet.
  agent-browser find role button click --name "Switch user"
  opened=false
  for attempt in $(seq 1 10); do
    if AGENT_BROWSER_DEFAULT_TIMEOUT=1000 agent-browser wait --text "$name" >/dev/null 2>&1; then
      opened=true
      break
    fi
    agent-browser find role button click --name "Switch user"
  done
  if [ "$opened" != "true" ]; then
    echo "Switch-user dropdown never opened for $name" >&2
    exit 1
  fi

  agent-browser find text "$name" click --exact

  # The switch-user form redirects back to /dashboard and re-runs loaders;
  # wait for the newly-selected name to show up in the sidebar rather than
  # for a URL change, since the URL doesn't actually change.
  agent-browser wait --load networkidle
  agent-browser wait --text "$name"

  agent-browser screenshot "$OUT_DIR/$file.png" --full
  echo "Saved $OUT_DIR/$file.png"

  # ─── What the DOM says, now that the switch has happened ───
  report="After switching to $name ($role)"$'\n'
  ask "page title" "document.title"
  ask "sidebar names the user" \
    "document.querySelector('aside')?.innerText.includes('$name') ?? false"
  # The panel is a floating div; the user list only exists in the DOM while
  # React's `open` state is true. Its presence is the answer to "did the
  # switcher close itself after I used it?".
  ask "switcher list still open" \
    "!!document.querySelector('form[action*=\"/api/switch-user\"]')"

  # The browser's own record of what went wrong, which no screenshot holds.
  errors="$(agent-browser errors 2>/dev/null || true)"
  report="${report}console errors: ${errors:-none}"$'\n'
  echo "  console errors: ${errors:-none}"

  printf '%s' "$report" > "$OUT_DIR/$file.txt"
  echo "Saved $OUT_DIR/$file.txt"

  index=$((index + 1))
done

agent-browser close

echo "Done. Screenshots and DOM readouts:"
ls -la "$OUT_DIR"
