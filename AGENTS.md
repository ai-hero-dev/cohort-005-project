Requests flow **route → service → Drizzle**. Routes own HTTP concerns and rendering; services own data access and use the shared `db` instance directly rather than receiving a handle.

## Verification checks

Before calling a change to `app/` done, run — in this order:

1. `npm run typecheck`
2. `npm run test`
3. `npm run test:mutation` — diff-based mutation testing (Stryker), scoped automatically to whatever `.ts`/`.tsx` files under `app/` this change actually touched (committed since `main`, or still sitting uncommitted). A green test suite with a surviving mutant means the tests run, but don't actually pin the behavior down — read a survivor as a review comment on the test, not the implementation, and either strengthen the test or note why the mutant is an accepted unspecified behavior. This is a full `stryker run` scoped down to a handful of files, not the whole `app/services/` tree — it stays fast enough to run every time, not just occasionally. Also runs in Stryker's `incremental` mode, caching mutant results in `reports/stryker-incremental.json` (gitignored, local-only) — rerunning after fixing a survivor skips re-testing mutants your fix didn't touch, so iterating on the same diff gets faster each time.

## When something breaks

| Symptom                                         | Cause                                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 401 "Select a user from the DevUI panel"        | No user in the session — switch users and country in the floating panel (`app/components/dev-ui.tsx`). |
| `tsc` reports every `./+types/*` import missing | Typegen has not run. Use `npm run typecheck`, which runs `react-router typegen` first.                 |
| A test run leaves rows in `data.db`             | The `~/db` mock is wrong — see the `testing-services` skill.                                           |

## Agent skills

### Issue tracker

Issues and PRDs live as GitHub issues on `ai-hero-dev/ai-coding-crash-course`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.
