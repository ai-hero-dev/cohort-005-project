# Why this isn't in `.github/workflows/`

`frontend-screenshot-poc.yml` in this directory is a complete, ready-to-run
GitHub Actions workflow. It is staged here instead of `.github/workflows/`
because the bot token this PR was pushed with (`GH_TOKEN`, an OAuth App
token scoped to `admin:public_key, gist, read:org, repo`) does not carry
the `workflow` scope, and GitHub refuses **any** write — `git push`, and
the Contents API — that touches a file under `.github/workflows/` without
it. Both paths were tried and both were refused; see this PR's description
for the exact errors.

To finish landing this PR, a human with full repo access needs to do one
of, in order of preference:

1. **In the GitHub web UI** (uses your own browser session, not this bot's
   token, so the restriction doesn't apply): open
   `.github/workflows-pending/frontend-screenshot-poc.yml`, use "Copy raw
   file", create a new file at `.github/workflows/frontend-screenshot-poc.yml`
   with that content, delete this `workflows-pending/` directory, and commit
   directly to this branch.
2. **Locally**: `git mv .github/workflows-pending/frontend-screenshot-poc.yml
   .github/workflows/frontend-screenshot-poc.yml && rmdir
   .github/workflows-pending && git commit && git push`.
3. **Grant `workflow` scope** to the bot's `GH_TOKEN` — then a follow-up
   agent turn can make the same move itself and finish triggering/verifying
   the run.

Once the file is at `.github/workflows/frontend-screenshot-poc.yml`, delete
this README along with it.
