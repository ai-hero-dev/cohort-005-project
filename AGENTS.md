## Verification checks

Do these checks in this order before you report a change to `app/` as complete:

1. `npm run typecheck`
2. `npm run test`

## When something breaks

| Symptom                                         | Cause                                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 401 "Select a user from the DevUI panel"        | No user in the session — switch users and country in the floating panel (`app/components/dev-ui.tsx`). |
| `tsc` reports every `./+types/*` import missing | Typegen has not run. Use `npm run typecheck`, which runs `react-router typegen` first.                 |

## Coding standards

`CODING_STANDARDS.md` at the root holds the rules that apply everywhere. Each
area keeps its own, and a file applies to the directory it sits in and
everything under it:

- `app/db/CODING_STANDARDS.md` — the schema, migrations and every query
- `app/routes/CODING_STANDARDS.md` — loaders and actions
- `app/components/CODING_STANDARDS.md` — React components

Read the root file and the one for the directory you are editing.

## Agent skills

### Issue tracker

Issues and PRDs live as GitHub issues on `ai-hero-dev/cohort-005-project`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.
