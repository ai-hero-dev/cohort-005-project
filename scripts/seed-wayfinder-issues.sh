#!/usr/bin/env bash
# Seed a Wayfinder checkpoint into your own repo's GitHub Issues, so you can
# pick up the course from that point.
#
#   npm run seed-wayfinder-issues 01-chart-the-map
#
# Needs: gh (logged in) and jq. Run it from your own copy of the course repo
# (the one `ai-hero fork` made), never the course repo itself.
set -euo pipefail

GIST=87be0d1df4945234bba66f775ade6768
COURSE_REPO=ai-hero-dev/cohort-005-project

die() { echo "error: $*" >&2; exit 1; }

command -v gh >/dev/null || die "install the GitHub CLI: https://cli.github.com"
command -v jq >/dev/null || die "install jq: https://jqlang.org/download"

# 1. Load the checkpoint from the gist.
gist=$(gh api "gists/$GIST")
available=$(jq -r '.files | keys[] | select(endswith(".json")) | rtrimstr(".json")' <<<"$gist")
checkpoint=${1:-}
[ -n "$checkpoint" ] || die "usage: npm run seed-wayfinder-issues <checkpoint>
available checkpoints:
$available"
snapshot=$(jq -r --arg f "$checkpoint.json" '.files[$f].content // empty' <<<"$gist")
[ -n "$snapshot" ] || die "no checkpoint called \"$checkpoint\". Available checkpoints:
$available"
gist_url=$(jq -r .html_url <<<"$gist")

# 2. Work out which repo we're seeding: always your origin remote.
repo=$(gh repo view "$(git remote get-url origin)" --json nameWithOwner --jq .nameWithOwner)
[ "$repo" != "$COURSE_REPO" ] || die "origin is the course repo itself. Run \`ai-hero fork\` first, then rerun this from your copy."
echo "Seeding checkpoint $checkpoint into $repo"

if [ "$(gh repo view "$repo" --json hasIssuesEnabled --jq .hasIssuesEnabled)" != "true" ]; then
  echo "Issues are turned off on $repo. Turning them on (gh repo edit --enable-issues)..."
  gh repo edit "$repo" --enable-issues
fi

# 3. Refuse if a map is already open. A closed map doesn't count.
open_map=$(gh issue list -R "$repo" --label wayfinder:map --state open --json number --jq '.[0].number // empty')
[ -z "$open_map" ] || die "$repo already has an open Wayfinder map (#$open_map).
Close it (gh issue close $open_map -R $repo) if you want to seed a fresh set."

# 4. Labels. --force updates any that already exist.
jq -c '.labels[]' <<<"$snapshot" | while read -r label; do
  gh label create "$(jq -r .name <<<"$label")" -R "$repo" --force \
    --color "$(jq -r .color <<<"$label")" --description "$(jq -r .description <<<"$label")"
done

# 5. Create the issues in map order. Bodies come later, once we know every
#    new number. `numbers` maps old number -> {number, id} (id = database id).
numbers='{}'
for key in $(jq -r '.issues[].key' <<<"$snapshot"); do
  created=$(jq '.issues[] | select(.key == '"$key"') | {title, labels, body: "Seeding..."}' <<<"$snapshot" |
    gh api "repos/$repo/issues" --input - --jq '{number, id}')
  numbers=$(jq --arg key "$key" --argjson new "$created" '.[$key] = $new' <<<"$numbers")
  echo "  #$key -> #$(jq .number <<<"$created")"
done
new() { jq -r --arg key "$1" ".[\$key].$2" <<<"$numbers"; }

# 6. Point every link at your repo: issue URLs and #N refs get the new
#    numbers, research docs point at the gist.
snapshot=$(jq --arg repo "$repo" --arg from "$COURSE_REPO" --arg gist "$gist_url" --argjson numbers "$numbers" '
  def renumber: ($numbers[.n].number // .n) | tostring;
  def rewrite:
    gsub("https://github\\.com/\($from)/blob/research/[^/]+/docs/research/(?<f>[a-z0-9-]+)\\.md"; "\($gist)#file-\(.f)-md")
    | gsub("https://github\\.com/\($from)/issues/(?<n>[0-9]+)"; "https://github.com/\($repo)/issues/\(renumber)")
    | gsub("(?<![\\w&/])#(?<n>[0-9]+)\\b"; "#\(renumber)");
  .issues[] |= (.body |= rewrite | .comments[].body |= rewrite)' <<<"$snapshot")

for key in $(jq -r '.issues[].key' <<<"$snapshot"); do
  jq '.issues[] | select(.key == '"$key"') | {body}' <<<"$snapshot" |
    gh api -X PATCH "repos/$repo/issues/$(new "$key" number)" --input - --silent
done

# 7. Sub-issues, in map order.
for parent in $(jq -r '.issues[] | select(.sub_issues | length > 0) | .key' <<<"$snapshot"); do
  for child in $(jq -r '.issues[] | select(.key == '"$parent"') | .sub_issues[]' <<<"$snapshot"); do
    gh api -X POST "repos/$repo/issues/$(new "$parent" number)/sub_issues" -F sub_issue_id="$(new "$child" id)" --silent
  done
done

# 8. Blocked-by edges.
for key in $(jq -r '.issues[] | select(.blocked_by | length > 0) | .key' <<<"$snapshot"); do
  for blocker in $(jq -r '.issues[] | select(.key == '"$key"') | .blocked_by[]' <<<"$snapshot"); do
    gh api -X POST "repos/$repo/issues/$(new "$key" number)/dependencies/blocked_by" -F issue_id="$(new "$blocker" id)" --silent
  done
done

# 9. Comments, then close whatever was closed.
for key in $(jq -r '.issues[].key' <<<"$snapshot"); do
  jq -c '.issues[] | select(.key == '"$key"') | .comments[]' <<<"$snapshot" | while read -r comment; do
    gh api "repos/$repo/issues/$(new "$key" number)/comments" --input - --silent <<<"$comment"
  done
  if [ "$(jq -r '.issues[] | select(.key == '"$key"') | .state' <<<"$snapshot")" = "closed" ]; then
    jq '.issues[] | select(.key == '"$key"') | {state, state_reason}' <<<"$snapshot" |
      gh api -X PATCH "repos/$repo/issues/$(new "$key" number)" --input - --silent
  fi
done

map=$(jq -r '.issues[] | select(.labels | index("wayfinder:map")) | .key' <<<"$snapshot")
echo "Done. Your map: https://github.com/$repo/issues/$(new "$map" number)"
