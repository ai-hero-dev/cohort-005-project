# Pre-commit checks

`.husky/pre-commit` runs, in order:

| Step                      | What it does                                  |
| ------------------------- | --------------------------------------------- |
| `npx lint-staged`         | Prettier over the staged files, in place      |
| `npm run typecheck`       | `react-router typegen` then `tsc`             |
| `npm run test`            | The whole Vitest suite                        |
| `npm run lint:boundaries` | dependency-cruiser over the module boundaries |
| `npm run check:file-size` | Blocks a staged file over the token budget    |

Husky installs itself from the `prepare` script, so `npm install` is all a
fresh clone needs.

## `check:file-size` — the token budget

`scripts/check-file-size.sh`. For every **staged** file it counts bytes,
divides by four, and blocks the commit if the result is over `MAX_TOKENS`
(5500). It names each file it stopped.

Bytes divided by four is the standard rough token count for English and for
code. The budget is the prose rule in `CODING_STANDARDS.md` — "keep files
under 500 lines" — in the unit that the reader who pays for it
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
