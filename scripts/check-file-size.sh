#!/bin/bash
#
# Blocks a commit if a staged file is longer than the budget in
# CODING_STANDARDS.md ("Keep a file under five hundred lines").
#
# The budget is in tokens, not lines, because the reader that matters most
# here is an agent, and an agent pays per token. Bytes divided by four is a
# close enough count for English prose and for TypeScript: about 500 lines of
# TypeScript is about 22,000 bytes, which is about 5,500 tokens.
#
# See docs/agents/pre-commit-checks.md for the writeup.

MAX_TOKENS=5500
found_violations=0

# Patterns to exclude from the check. Comment every entry with *why* —
# an exclusion with no reasoning invites more silent exclusions.
EXCLUDE_PATTERNS=(
  "*.lock"
  "package-lock.json"
  # Prose. A long design document or ADR is a document, not a module.
  "docs/*"
  "_internal/*"
  # Drizzle's generated migration SQL and snapshots — never hand-edited.
  "drizzle/*"
  # The request logger ships with the course. It is a tool you point at your
  # agent, not application code, and splitting it teaches nobody anything.
  "request-logger/*"
  # Generated fixture data, one long array of rows.
  "scripts/seed.ts"
)

should_skip() {
  local file="$1"
  for pattern in "${EXCLUDE_PATTERNS[@]}"; do
    case "$file" in
      $pattern) return 0 ;;
    esac
  done
  return 1
}

while IFS= read -r file; do
  if [ -z "$file" ] || [ ! -f "$file" ]; then
    continue
  fi

  if should_skip "$file"; then
    continue
  fi

  # Skip binary files
  if file --mime-encoding "$file" 2>/dev/null | grep -q "binary"; then
    continue
  fi

  bytes=$(wc -c < "$file")
  tokens=$((bytes / 4))

  if [ "$tokens" -gt "$MAX_TOKENS" ]; then
    if [ "$found_violations" -eq 0 ]; then
      echo ""
      echo "ERROR: The following files exceed the ${MAX_TOKENS}-token limit:"
      echo ""
    fi
    echo "  $file (~${tokens} tokens)"
    found_violations=1
  fi
done < <(git diff --cached --name-only --diff-filter=d)

if [ "$found_violations" -eq 1 ]; then
  echo ""
  echo "Please split these files into smaller modules or test files."
  exit 1
fi
