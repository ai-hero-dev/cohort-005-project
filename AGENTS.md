## Verification checks

Do these checks in this order before you report a change to `app/` as complete:

1. `npm run typecheck`
2. `npm run test`
3. `npm run test:mutation`
4. `npm run check:console -- <route>`, when you changed anything that renders

### About `npm run test:mutation`

This command does mutation testing with Stryker. It examines the `.ts` and
`.tsx` files below `app/lib/`, `app/services/` and `request-logger/` that the
current change touches. A file counts as touched if a commit changed it after the branch
left `main`, or if it is uncommitted now.

Those three directories are the whole of the scope, because they are the
whole of what a test reaches. No test imports a route module — a loader needs
a `Request` and a database — so every mutant in one comes back `NoCoverage`,
which you already knew. Mutation testing does not close that gap. `app/services/`
is where a piece goes when you want it graded: it holds the rules that used to
be inline in a loader, behind an interface a test can call.

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

The command is a full `stryker run` on a small number of files. Thus it is
quick enough to use for each change.

The command also uses the `incremental` mode of Stryker. This mode keeps the
results in `reports/stryker-incremental.json`, which is local and gitignored.
After you correct one survivor, the next run examines again only the mutants
that your correction can affect.

To read the report, see the `mutation-testing` skill.

### About `npm run check:dashboards`

This command drives a real browser through the app with agent-browser,
screenshots `/dashboard` as three users, and reads the DOM back for each. Use
it to check a change you cannot check from the terminal, and to answer a
question about the page yourself rather than asking the person you are
working for. See `docs/agents/agent-browser.md`.

### About `npm run check:console`

This command opens one route in a headless browser and prints the browser
console. `typecheck` and `test` never load a page, so a component that breaks
in the browser passes both. See `docs/agents/frontend-feedback-loop.md`.

`.husky/pre-commit` runs both again, and then `npm run lint:oxlint`,
`npm run lint:boundaries` and `npm run check:file-size`. See `docs/agents/pre-commit-checks.md`.

## When something breaks

| Symptom                                         | Cause                                                                                                                                                                      |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 401 "Select a user from the DevUI panel"        | No user in the session — switch users and country in the floating panel (`app/components/dev-ui.tsx`).                                                                     |
| `tsc` reports every `./+types/*` import missing | Typegen has not run. Use `npm run typecheck`, which runs `react-router typegen` first.                                                                                     |
| The page renders and every button is dead       | The browser could not run a module, so React never hydrated. Run `npm run check:console -- <route>` and read the first error. See `docs/agents/frontend-feedback-loop.md`. |

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

### Codebase design

Services are deep modules: read [app/services/README.md](./app/services/README.md)
before you add one or import one. `npm run lint:boundaries` enforces the
boundary, and `.husky/pre-commit` runs it.

The `codebase-design` skill holds the vocabulary this repo uses to talk about
its own shape — **module**, **interface**, **implementation**, **depth**,
**seam**, **adapter**. Use those words rather than inventing new ones. The rule
that goes with them is "Judge a module by what its interface hides" in
`CODING_STANDARDS.md`.
