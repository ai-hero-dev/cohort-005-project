# Pre-commit checks

`.husky/pre-commit` runs, in order: `lint-staged` (Prettier on staged files), `typecheck`, `test`, `lint:oxlint`, `check:file-size`.

## `lint:oxlint` — oxlint + a custom rule

`oxlint -c .oxlintrc.json`. Built-in rules plus one custom JS plugin rule,
`no-adjacent-same-type-params` (`scripts/lint-rules/no-adjacent-same-type-params.js`), which
flags two consecutive function parameters sharing the same type — e.g.
`removeOption(questionId: string, optionId: string)`. A caller can swap
arguments like that by accident and TypeScript won't catch it; the fix is a
single destructured object parameter.

Uses oxlint's [JS Plugins](https://oxc.rs/docs/guide/usage/linter/writing-js-plugins)
API (alpha as of 2026-03-11) — an ESLint-compatible `create(context)` /
`context.report()` shape running through oxlint's Rust core.

**Currently set to `"warn"`, not `"error"`** in `.oxlintrc.json`. A repo-wide
scan turned up 114 pre-existing matches across 23 files, almost all in
`app/services/*` (e.g. `videoTrackingService.ts`'s `userId: number, lessonId: number`
pattern, repeated across five functions). That's real signal, not noise — but
fixing 114 call sites is its own piece of work, not something to fold
silently into a tooling PR. Flip the rule to `"error"` once that pass is done
(or scope it down with an `.oxlintrc.json` overrides block per-directory).

Adding a new rule: write a plugin file under `scripts/lint-rules/`, add it to
`jsPlugins` in `.oxlintrc.json`, and add `<plugin-name>/<rule-name>` under
`rules`.

## `check:file-size` — token-budget check

`scripts/check-file-size.sh`. Approximates tokens as `bytes / 4` for every
**staged** file, blocks the commit if any exceeds `MAX_TOKENS` (currently
5500), and names the offending files. Adapted from an identical script
already running on `course-video-manager`.

Exclusions live in the script's `EXCLUDE_PATTERNS` array — comment every
entry with _why_ it's there. An exclusion with no reasoning invites the next
silent exclusion.
