## Verification checks

Do these checks in this order before you report a change to `app/` as complete:

1. `npm run typecheck`
2. `npm run lint:boundaries`
3. `npm run test`
4. `npm run test:mutation`

Or run the first three with `npm run check`.

`npm run lint:oxlint` lints the whole repository with oxlint (`.oxlintrc.json`).

Modules are deep modules: see [app/modules/README.md](./app/modules/README.md) before adding or importing one.

### About `npm run test:mutation`

This command does mutation testing with Stryker. It examines the `.ts` and
`.tsx` files below `app/lib/`, `app/modules/` and `request-logger/`, and only
the lines in them that the current change touches. A line counts as touched if
a commit added or changed it after your diff base, if it is uncommitted now, or
if it is in an untracked file. Your diff base is the commit you last reset to
(`npm run reset <slug>`), not `main`. See `scripts/mutate-diff.ts`.

Those three directories are the whole of the scope, because they are the whole
of what a test reaches. No test imports a route module — a loader needs a
`Request` and a database — so every mutant in one comes back `NoCoverage`,
which you already knew. Mutation testing does not close that gap. Write the
test first, then grade it here.

Name the target yourself to grade an area rather than a change:

```
npm run test:mutation -- app/lib
```

Run this command from the top of the repository.

A mutant that survives is a comment about the test, not about the source. The
suite is green, but it does not pin the behaviour down. For each survivor, do
one of these:

- Make the test stronger, until it fails against the mutant.
- Record why the behaviour is unspecified, and why you accept the mutant.

The command uses the `incremental` mode of Stryker. This mode keeps the
results in `reports/stryker-incremental.json`, which is local and gitignored.
After you correct one survivor, the next run examines again only the mutants
that your correction can affect.

To read the report, see the `mutation-testing` skill.

### About agent-browser

agent-browser lets you drive a real browser through the app from the
terminal: open a page, click, and read the DOM back. Use it to check a change
that `typecheck` and `test` cannot see, and to answer a question about the
page yourself rather than asking the person you are working for. See
`docs/agents/agent-browser.md`.

## When something breaks

| Symptom                                         | Cause                                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 401 "Select a user from the DevUI panel"        | No user in the session — switch users and country in the floating panel (`app/components/dev-ui.tsx`). |
| `tsc` reports every `./+types/*` import missing | Typegen has not run. Use `npm run typecheck`, which runs `react-router typegen` first.                 |

## Agent skills

### Issue tracker

Issues and PRDs live as GitHub issues on `ai-hero-dev/cohort-005-project`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.
