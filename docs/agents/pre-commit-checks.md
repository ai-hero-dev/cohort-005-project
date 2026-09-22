# Pre-commit checks

`.husky/pre-commit` runs, in order:

| Step                      | What it does                               |
| ------------------------- | ------------------------------------------ |
| `npx lint-staged`         | Prettier over the staged files, in place   |
| `npm run typecheck`       | `react-router typegen` then `tsc`          |
| `npm run test`            | The whole Vitest suite                     |
| `npm run lint:oxlint`     | oxlint over the whole repository           |
| `npm run check:file-size` | Blocks a staged file over the token budget |

Husky installs itself from the `prepare` script, so `npm install` is all a
fresh clone needs.

## `lint:oxlint` — the linter

`oxlint -c .oxlintrc.json`. oxlint is a Rust linter with the ESLint rule set
built in, fast enough to run over the whole repository on every commit rather
than over the staged files only.

`.oxlintrc.json` sets the `correctness` category to `"warn"`, so oxlint
reports and the commit continues. That is deliberate. A clean run on this
repository is not available today — there are about thirty pre-existing
warnings, most of them unused imports and unused destructured variables left
behind when the services were folded into their routes. Turning those into
errors would block every commit until somebody did that pass, and that pass
is its own piece of work.

Raise a rule to `"error"` when the repository is clean of it, not before.

### The custom rule — `route-config/matches-filename`

`scripts/lint-rules/route-config-matches-filename.js`, a JS plugin loaded
through `jsPlugins` in `.oxlintrc.json`.

`app/routes.ts` registers every route by hand — a URL path, and the file that
serves it. TypeScript checks that the file exists. It has no opinion about
whether the path a visitor types matches the file's name, so the two drift,
and the route keeps working at an address nobody links to.

The rule reads each `route(path, file)` entry, derives the path the filename
claims (a dot is a separator, `$x` is `:x`), and reports the entry when the
two disagree — or when the file is not on disk.

The first run reported one entry: `routes/redeem.$code.tsx` was registered at
`invite/:code`, so `/redeem/:code` — the address `team.tsx` copies into an
invite link — served nothing. The path was the lie, so this commit corrected
it back to `redeem/:code`, and the rule now reports nothing. Read the message
before you change anything: the rule says which two things disagree, not which
of them is wrong.

It is a **warning**. A path can legitimately disagree with a filename, and a
rule that has been right once is not yet a rule that may block a commit.

Adding another: write a plugin file under `scripts/lint-rules/`, add it to
`jsPlugins`, and add `<plugin-name>/<rule-name>` under `rules`. oxlint's JS
plugin API is ESLint-shaped — `create(context)` and `context.report()` — and
runs in Node through oxlint's Rust core.

## `check:file-size` — the token budget

`scripts/check-file-size.sh`. For every **staged** file it counts bytes,
divides by four, and blocks the commit if the result is over `MAX_TOKENS`
(5500). It names each file it stopped.

Bytes divided by four is the standard rough token count for English and for
code. The budget is the prose rule in `CODING_STANDARDS.md` — "keep a file
under five hundred lines" — in the unit that the reader who pays for it
uses. About 500 lines of TypeScript is about 22,000 bytes, which is about
5,500 tokens.

The check looks at staged files only. A file that is already over the budget
does not block a commit that does not touch it — but the first change to that
file has to split it. That is the intent: the rule bites when you are already
in there.

Exclusions live in the script's `EXCLUDE_PATTERNS` array. **Comment every
entry with _why_ it is there.** An exclusion with no reasoning invites the
next silent exclusion.

## Prettier

`.prettierrc` sets `embeddedLanguageFormatting: "off"`. Half this repository's
Markdown is teaching material, and its code fences are written to make a
point — sometimes a deliberately bad one. Prettier reformatting them would
edit the lesson.

## Skipping it

`git commit --no-verify` skips every hook. Use it when you know the check is
wrong, not when you are in a hurry — a check you route around every day is a
check you should delete or fix.
