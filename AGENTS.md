Requests flow **route → service → Drizzle**. Routes own HTTP concerns and rendering; services own data access and use the shared `db` instance directly rather than receiving a handle.

## Verification checks

Do these checks in this order before you report a change to `app/` as complete:

1. `npm run typecheck`
2. `npm run test`
3. `npm run test:mutation`

### About `npm run test:mutation`

This command does mutation testing with Stryker. It examines only the `.ts` and `.tsx` files below `app/` that the current change touches. A file counts as touched if a commit changed it after the branch left `main`, or if it is uncommitted now.

Run this command from the top of the repository.

A mutant that survives is a comment about the test, not about the source. The suite is green, but it does not pin the behaviour down. For each survivor, do one of these:

- Make the test stronger, until it fails against the mutant.
- Record why the behaviour is unspecified, and why you accept the mutant.

The command is a full `stryker run` on a small number of files. Thus it is quick enough to use for each change.

The command also uses the `incremental` mode of Stryker. This mode keeps the results in `reports/stryker-incremental.json`, which is local and gitignored. After you correct one survivor, the next run examines again only the mutants that your correction can affect.

To read the report, see the `mutation-testing` skill.

## When something breaks

| Symptom                                         | Cause                                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 401 "Select a user from the DevUI panel"        | No user in the session — switch users and country in the floating panel (`app/components/dev-ui.tsx`). |
| `tsc` reports every `./+types/*` import missing | Typegen has not run. Use `npm run typecheck`, which runs `react-router typegen` first.                 |
| A test run leaves rows in `data.db`             | The `~/db` mock is wrong — see the `testing-services` skill.                                           |

## Agent skills

### Issue tracker

Issues and PRDs live as GitHub issues on `ai-hero-dev/ai-coding-crash-course`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.
