# Why this isn't in `.github/workflows/`

`frontend-screenshot-poc.yml` in this directory is a **fix to the already-live**
`.github/workflows/frontend-screenshot-poc.yml`, staged here instead of applied
directly because the bot token backing this PR (`GH_TOKEN`, OAuth App scope
`admin:public_key, gist, read:org, repo`) does not carry the `workflow` scope.
GitHub refuses any write — `git push`, and the Contents API — that touches a
file under `.github/workflows/` without it (same restriction PR #2 hit
creating this file the first time; confirmed again here on an *edit*, not
just a create).

## What changed vs. the live file

Two named steps were collapsed into one, and `--attach` was dropped:

```diff
-      - name: Update GitHub CLI
-        if: success()
-        run: |
-          # ubuntu-latest's preinstalled gh can lag behind the `--attach`
-          # flag (shipped in gh v2.99.0), so pull the latest from GitHub's
-          # own apt repo rather than assume the runner image has caught up.
-          ...
-          gh --version
-
-      - name: Attach screenshots to the triggering PR, if any
+      - name: Comment on the triggering PR, if any
         if: success()
         env:
           GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
           GH_REPO: ${{ github.repository }}
           BRANCH: ${{ github.ref_name }}
         run: |
           set -euo pipefail
           pr_number=$(gh pr list --head "$BRANCH" --state open --json number --jq '.[0].number // empty')
           if [ -z "$pr_number" ]; then
             echo "No open PR for branch '$BRANCH' — screenshots are still available as a workflow artifact above. Skipping PR comment."
             exit 0
           fi
+          # `gh pr comment --attach` looks tempting here, but it rejects the
+          # default GITHUB_TOKEN client-side: Actions issues a GitHub App
+          # installation token (`ghs_...`), and the attachment-upload
+          # endpoint 404s those, so gh's own allowlist refuses them upfront
+          # with "unsupported authentication type" (cli/cli#14309). A
+          # fine-grained/classic PAT would work but isn't worth the extra
+          # secret for a POC -- just point at the artifact instead.
           gh pr comment "$pr_number" \
-            --body "Dashboard screenshots from this run: https://github.com/${GH_REPO}/actions/runs/${{ github.run_id }}" \
-            --attach "screenshots/01-admin-alex-rivera.png#Dashboard, logged in as Alex Rivera (admin)" \
-            --attach "screenshots/02-instructor-sarah-chen.png#Dashboard, logged in as Sarah Chen (instructor)" \
-            --attach "screenshots/03-student-emma-wilson.png#Dashboard, logged in as Emma Wilson (student)"
+            --body "Dashboard screenshots from this run: https://github.com/${GH_REPO}/actions/runs/${{ github.run_id }} (see the \`dashboard-screenshots\` artifact)"
```

Why: the actual `workflow_dispatch` run on this branch
(https://github.com/ai-hero-dev/cohort-005-project/actions/runs/34864197821)
got past the screenshot step for the first time (thanks to the two script
fixes in this PR) and reached this step for the first time too — where it
failed with `unsupported authentication type`. That's not a gh-version
problem the "Update GitHub CLI" step can fix: `--attach` explicitly rejects
GitHub App installation tokens client-side regardless of version, because
the underlying attachment-upload endpoint 404s them (see
[cli/cli#14309](https://github.com/cli/cli/issues/14309)). `GITHUB_TOKEN` in
Actions is always this token type, so `--attach` can never work here without
swapping in a PAT — not worth it for a POC, hence dropping it in favor of a
plain link.

## To finish landing this

1. **In the GitHub web UI** (uses your own browser session, not this bot's
   token, so the restriction doesn't apply): open
   `.github/workflows-pending/frontend-screenshot-poc.yml`, "Copy raw file",
   paste it over `.github/workflows/frontend-screenshot-poc.yml`'s contents,
   delete this `workflows-pending/` directory, and commit directly to this
   branch.
2. **Locally**: `git mv .github/workflows-pending/frontend-screenshot-poc.yml
   .github/workflows/frontend-screenshot-poc.yml && rmdir
   .github/workflows-pending && git commit && git push`.
3. **Grant `workflow` scope** to the bot's `GH_TOKEN` — then a follow-up
   agent turn can make the same move itself, re-run the workflow, and
   confirm the PR comment posts cleanly.

Once the file is at `.github/workflows/frontend-screenshot-poc.yml`, delete
this README along with it.
