# Cohort 005 — Implementation Plan

Companion to `commit-history-spec.md`. The spec says **what** the history must be. This says **how to
build it**, in order, with the exact commit list.

Written 2026-09-22, after the four open questions were answered.
**BUILT 2026-09-22.** See Part 8 for what actually landed.

---

## Part 0 — What changed since the spec

### The four answers

| # | Question | Answer |
|---|---|---|
| O1 | Refund: `main` seed, or Part Two ticket T1? | **Seed it on `main`.** It feeds Domain Language. |
| O2 | What replaces `analyticsService.ts` as Codebase Design's subject? | **The bloated analytics loader.** The section becomes extraction. |
| O3 | Codebase Design's CVM lesson numbering | **Ignored.** Not a problem to solve. |
| O4 | Which sections need stub commits? | **Every LIVE bit gets its own stub.** This sets the count. |

### Three findings from reading `origin/main`

These were not known when the spec was written. All three change the work.

**F1 — The `testing-services` skill is prior art, and it is the worst of it.**
`.agents/skills/testing-services/SKILL.md` teaches the exact seam the worsening destroys:

> Services import the shared `db` singleton rather than receiving a handle, so a test substitutes the
> database by **mocking the module** … Mock `~/db` with a **getter**, and import the module under test
> **after** the mock.

That is a written, shipped, agent-readable instruction for how to build and test a service layer. Under
A2 and A3 it cannot stay. **Delete the skill directory in the worsening**, and delete `AGENTS.md` line 34,
which points at it. Deleting the service files but leaving the skill that explains them would be the
worst of both: no code to copy, but a manual telling the agent what to rebuild.

**F2 — The `code-review` skill is already on `main`.** So is `to-spec`, `to-tickets`, `implement`,
`grill-me`, `grilling` and `tdd`. The spec listed `add-code-review-skill` as a Review seed. **Drop it** —
the skill is already there. This removes one stub.

**F3 — Refund is genuinely absent.** `git grep -il refund origin/main -- app/` returns nothing. Seeding
the Refund feature on `main` is not a move, it is **building a feature from zero**, including the
three-screen naming drift and the 14-day-window UTC bug that Domain Language L3 fixes. This is the
largest single piece of new application code in the whole plan, and it is on the critical path for
Section 2.

---

## Part 1 — Phase 0: safety net and local sync

Local `main` is stale. It sits at `106f759 "Initial"`, 23 commits behind `origin/main` (`c53d804`).
Work from a fresh checkout of the remote, not from what is on disk.

```bash
cd ~/repos/ai/cohort-005-project
git fetch origin

# Back up both branches remotely. A local-only backup does not survive a discarded workspace.
TS=$(date +%s)
git branch backup/main-pre-worsening-$TS          origin/main
git branch backup/live-run-through-pre-stack-$TS  origin/live-run-through
git push origin backup/main-pre-worsening-$TS backup/live-run-through-pre-stack-$TS

# Sync local main to the remote.
git checkout main && git reset --hard origin/main
```

`live-run-through` is a single root commit today, so the second backup protects nothing real. Push it
anyway — it costs one second and it removes the question.

---

## Part 2 — Phase 1: five commits on `main`

`main` is the student's starting clone. These five commits, in this order, make it the bad start point.

### 1. `worsen-the-services`

The single most important commit in the course.

| Step | Work | Measured |
|---|---|---|
| 1 | Fold all 16 `app/services/*.ts` into their route loaders and actions. Where two routes share a function, **copy it into both**. | 4,000 lines moved into 30 routes |
| 2 | `analyticsService.ts` and `commentService.ts` go too. They are the deepest and best documented, so they are the most dangerous to keep. (A2) | — |
| 3 | Delete all 12 `app/services/*.test.ts`. Nothing is left to import. | 5,207 lines, **391 tests** |
| 4 | Delete `.agents/skills/testing-services/` entirely. (F1, A3) | 2 files |
| 5 | `AGENTS.md`: delete line 1's `route → service → Drizzle` rule, and line 34's pointer at the deleted skill. (A3) | 2 lines |
| 6 | Do **not** touch `app/lib/` or `request-logger/`. All pure tests survive. (A5) | **377 tests in 10 files kept** |
| 7 | Leave `redeem.$code.tsx` and `instructor.$courseId.students.tsx` alone. They already import Drizzle into the route. After this commit they stop being exceptions and become the house style. | — |

**Check before you commit:**

```bash
test ! -d app/services && echo "services gone"
test ! -d .agents/skills/testing-services && echo "skill gone"
grep -c 'route → service' AGENTS.md          # expect 0
pnpm test                                     # expect 10 files, 377 passing, 0 failing
```

`pnpm test` must stay **green**. If anything is red, the worsening is wrong. The tests do not fail —
they become impossible to write, because a loader needs a `Request`, a router context and a matched
route, so there is nothing left to import and call. (A4)

### 2. `seed-refund-feature`

Build it **after** the worsening, so it is built in the new house style — Drizzle straight into the
loader, and the rule duplicated across screens. That duplication is what makes the naming drift
believable rather than planted.

What it must contain, taken from the Domain Language beats:

- A refund concept in the schema, and its migration.
- **Three screens, three names for one thing.** The purchase page says "Cancel my purchase", the
  confirmation email says "Reversal", the account page says "Pending Chargeback".
- The eligibility chain that L3 later names "Refund Policy": window, completion, watch-time,
  seat-claimed, PPP amount.
- **A 14-day window compared with a UTC/timezone bug in it.** L3 fixes this live, so the bug is
  load-bearing, not decoration.

This also composes with Codebase Design's `untestable-date-dependency`: the same 14-day window is the
date seam that section later extracts. Two sections, one feature, and the later one pays off the earlier.

### 3. `strip-stryker-from-main`

Confirmed present on `main`: `stryker.conf.mjs`, `scripts/mutate-diff.ts`. Remove both, and the
`.agents/skills/mutation-testing/` pointer only if it names the config path. It re-lands as the
Feedback Loops seed `stryker-pointed-at-diff`.

### 4. `strip-screenshot-workflow`

Confirmed present on `main`: `.github/scripts/screenshot-dashboards.sh`,
`.github/workflows/frontend-screenshot-poc.yml`. Remove both. They re-land, extended to read the DOM, as
the Feedback Loops seed `agent-browser`.

### 5. `reset-coding-standards`

`CODING_STANDARDS.md` already exists on `main`. Rewrite it to two or three real rules carried over from
the Crash Course. **No joke line.** Each later section then writes whatever state it needs on top (A8).

Then push:

```bash
git push origin main
```

`main` is not protected in this repo, and the CLI reads `upstream/main`, so this reaches students as
soon as it lands (A10).

---

## Part 3 — Phase 2: the stub stack, 44 commits

Under O4, every LIVE bit gets its own stub. The rule applied: **one stub per quest or playthrough that
changes the tree**, collapsed only where the student never lands mid-way.

`live-run-through` is a single root commit today, so building the stack discards nothing. This is the
cheapest possible moment.

```bash
git checkout -B live-run-through main
```

Then one `git commit --allow-empty -m '<slug>: <Title>'` per row below, top to bottom.

### Domain Language — 7

| # | Slug | Kind | What |
|---|---|---|---|
| 1 | `add-grill-and-domain-skills` | SEED | `grill-with-docs` + `domain-modeling` from the skills repo |
| 2 | `create-glossary-and-fix-refund-drift` | LIVE | L3: `glossary.md` born, "Refund" propagated across three screens, UTC bug fixed |
| 3 | `admin-refund-approval-adr` | LIVE | L5: approve/decline feature grilled, first ADR written — soft-delete the Enrollment |
| 4 | `seed-bloated-glossary` | SEED | L7 time-skip: noise + implementation-detail entries. Only ever seedable |
| 5 | `prune-the-glossary` | LIVE | L7: both kinds pruned, on two distinct criteria |
| 6 | `seed-adr-pile` | SEED | L8 time-skip: `docs/adr/` grown overwhelming |
| 7 | `prune-the-adr-pile` | LIVE | L8: dead ones found, deprecated not deleted |

### Wayfinder — 3

| # | Slug | Kind | What |
|---|---|---|---|
| 8 | `add-wayfinder-skill` | SEED | `wayfinder` plus its dependencies `prototype` and `research` |
| 9 | `add-wizard-skill` | SEED | `wizard`. Not a Wayfinder dependency, so separate |
| 10 | `ship-in-app-notifications` | LIVE | L9: data model, **Ably** wired, notification UI. One commit — the student never lands mid-lesson, the quest is to build it themselves |

`wayfinder-map-gist` is a GIST (A9), not a commit. L2–L8 and L10–L12 change nothing on the tree;
Wayfinder's middle is GitHub issues.

### Review — 7

`add-code-review-skill` is **dropped**: the skill is already on `main` (F2).

| # | Slug | Kind | What |
|---|---|---|---|
| 11 | `add-pr-skill` | SEED | `pr`, from `skills/in-progress/pr` |
| 12 | `seed-bookmarks-notes-diff` | SEED | L2: the Bookmarks/Notes feature in one diff, with a comment-drift habit and a spec deviation |
| 13 | `merge-bookmarks-notes-review-fix` | LIVE | L4: `/code-review`'s commit applied, diff merged |
| 14 | `add-retro-skill` | SEED | `retro`, from `skills/in-progress/retro` |
| 15 | `coding-standards-comment-drift-rule` | LIVE | L6: the comment-drift rule written into the existing file |
| 16 | `seed-bloated-coding-standards` | SEED | L7: the large unscoped version, standing in for months of growth |
| 17 | `split-and-prune-coding-standards` | LIVE | L7: split into scoped branches, trivial rules pruned |

**Knock-on:** L2's comment-drift habit is specced into `progressService.ts`, which the worsening
deletes. Seed it into the loader that absorbed progress instead.

### Feedback Loops — 12

| # | Slug | Kind | What |
|---|---|---|---|
| 18 | `coding-standards-feedback-loops` | SEED | The prose file-length rule L0 and L1 need. The section owns its own standards state (A7) |
| 19 | `husky-and-file-size-hook` | LIVE | L1: husky, lint-staged, `check-file-size.sh`, `.husky/pre-commit`. PR #5 is the reference, not the seed — the quest is "Turn The Sentence Into A Hook" |
| 20 | `add-oxlint-to-hook` | SEED | L2 setup: oxlint and `.oxlintrc.json` wired into the hook |
| 21 | `route-out-of-sync` | SEED | L2 setup: break one entry in `app/routes.ts`. All 29 match files today, so the drift must be planted |
| 22 | `custom-lint-rule` | LIVE | L2: the oxlint JS-plugin rule, shipped as a warning |
| 23 | `stryker-pointed-at-diff` | SEED | L4: PR #1's Stryker, re-landed after Phase 1 stripped it |
| 24 | `kill-one-survivor` | LIVE | L4: the new test |
| 25 | `db-import-in-client` | SEED | L6: a db-only import into `dev-ui.tsx`, killing hydration |
| 26 | `hydration-loop` | LIVE | L6: build the console-capturing loop |
| 27 | `move-the-helper` | LIVE | L6: fix it by moving the helper, not the import |
| 28 | `agent-browser` | SEED | L7: PRs #2/#4/#6 re-landed, extended to read the DOM |
| 29 | `fix-switcher-with-eyes` | LIVE | L7: fix the switcher bug, agent verifies itself through the DOM |

**Cut:** L3 *The CRAP Score* is marked OPTIONAL and not committed to film. No stub.
**Knock-on:** L6's seed is specced as "a db-only import via `app/services/userService.ts`".
`userService.ts` will not exist. Import `~/db` into the helper directly — the effect on hydration is
identical and the setup is one line shorter.

### Codebase Design — 8

Per O2, the target is the bloated analytics loader, and the section teaches **extraction**.

| # | Slug | Kind | What |
|---|---|---|---|
| 30 | `add-deep-modules-skills` | SEED | `setup-ts-deep-modules`, `improve-codebase-architecture`, `codebase-design` |
| 31 | `coding-standards-codebase-design` | SEED | The section's own standards state, before L11 adds its rule (A7) |
| 32 | `untestable-date-dependency` | SEED | L10: the date module. No API key, no dev-server complication, and it composes with the Refund 14-day window from `main` |
| 33 | `extract-a-service-from-a-loader` | LIVE | L10: narrow the analytics loader behind a seam and test it |
| 34 | `wire-deep-module-boundary` | LIVE | L11: point `setup-ts-deep-modules` at the narrowed module, fold its rule into standards |
| 35 | `architecture-rfc` | LIVE | L13: run `/improve-codebase-architecture`, the RFC lands |
| 36 | `rfc-to-shipped-fix` | LIVE | L14: RFC → spec → tickets → shipped, mechanically |
| 37 | `merge-date-modules` | LIVE | L16: merge them back, test as a larger unit |

**No stub for L8** *Hunt The Shallow Modules* — the quest ends with the viewer having *spotted* a shallow
module, which changes nothing on the tree. The worsening already supplies the mess, so the "Seed A
Vibe-Coded Mess" setup beat is now satisfied by `main` itself. **This is A2 paying for itself.**

**No stub for L15** *The Pass-Through Module* — it also ends in naming, not changing.
`app/lib/ppp.ts` is the free subject: four forwarding functions, already on `main`. The contrast case is
`app/lib/access.server.ts:103-150`, where `requireContentAccess` and `requireStaff` look like
pass-throughs and are not, because the throw is the added abstraction.

**Cut:** the architecture RFC seed (students use their own), the "deep module with no boundary
enforcement" seed and the "two modules, one adapter" seed. All three are satisfied by the section's own
earlier live output, which is what A7 asks for.

### Software Factory Part One — 6

| # | Slug | Kind | What |
|---|---|---|---|
| 38 | `add-implementer-workflow` | SEED | L2: `.github/workflows/agent-implement.yml`. Seeded, then explained live — the YAML is long and typing it teaches nothing |
| 39 | `add-review-workflow` | SEED | L3: `.github/workflows/agent-review.yml` |
| 40 | `factory-coding-standards` | SEED | L4 start: the file in the state this section needs |
| 41 | `factory-retro-rule` | LIVE | L4 end: the rule this lesson's own retro writes |
| 42 | `add-explore-workflow` | SEED | L5: `.github/workflows/agent-explore.yml`. Read-only, comments on the issue |
| 43 | `branch-explore-workflow` | LIVE | L6: the workflow branches on its own verdict |

`factory-ticket-gist` is a GIST. **The coupon feature is never merged into the stack** — L5 opens with
"implementer, review and standards in place" and never names the feature, which is what lets one feature
serve three lessons without a commit. L0 and L1 change nothing: secrets and a PAT are GitHub settings.

### Software Factory Part Two — 1

| # | Slug | Kind | What |
|---|---|---|---|
| 44 | `add-implement-spec-workflow` | SEED | L6 *The Hero Moment*'s provided gist: the chained workflow plus its cron trigger |

`analytics-queue-gist` is a GIST, authored live (A14). Every other lesson is diagram or whiteboard work.

### Verify and push

```bash
git log main..live-run-through --reverse --format='%s'   # 44 lines, each '<slug>: <Title>'
git log main..live-run-through --format='%s' | cut -d: -f1 | sort | uniq -d   # must be empty
git push --force-with-lease origin live-run-through
```

The second command is the one that matters. `reset` picks the *latest* commit matching a slug and
`cherry-pick` hides slugs already applied, so a duplicate slug is a silent trap, not an error.

### The count

| Section | Stubs | Gists |
|---|---|---|
| Before We Start | 0 | 0 |
| Domain Language | 7 | 0 |
| Wayfinder | 3 | 1 |
| Review | 7 | 0 |
| Feedback Loops | 12 | 0 |
| Codebase Design | 8 | 0 |
| Software Factory Part One | 6 | 1 |
| Software Factory Part Two | 1 | 1 |
| **Total** | **44** | **3** |

Before We Start has no stubs. Its only repo lessons are cloning, installing and migrating, which are
environment steps, not tree states.

---

## Part 4 — Phase 3: filling the stubs

Fill with `git rebase -i <sha>^`, mark the target `edit`, change the tree, `git commit --amend --no-edit`
to keep the slug, then `git rebase --continue`. Everything downstream rebases forward untouched.

`ai-hero-cli internal add-commit`, `edit-commit` and `rename-commit` do this too, and `edit-commit`
replays everything downstream — but **all three are interactive TUIs**, so they need a human at a
keyboard. Plain git is the headless route.

### Order of work

| Tier | Work | Why here |
|---|---|---|
| 1 | **The 13 skill seeds** — #1, #8, #9, #11, #14, #30 | Zero decisions. Pure copying from `~/repos/ai/skills`. Start any time, even before Phase 1 |
| 2 | **The three strips and `reset-coding-standards`** — `main` commits 3, 4, 5 | Small, independent, and they unblock the Feedback Loops re-lands |
| 3 | **`worsen-the-services`** | Blocks everything. Do it in one sitting |
| 4 | **`seed-refund-feature`** | Blocks Domain Language and composes into Codebase Design |
| 5 | **The three gists** | Blocks three sections. No repo work |
| 6 | **Cherry-pick PRs #1, #2, #4, #5, #6 into their Feedback Loops seeds** | The branches exist on `origin` already |
| 7 | **The remaining 31 stubs**, in stack order | Filming |
| 8 | **The CVM rewords in Part 5** | Before filming, or the video and the repo disagree |

Tier 1 is the right thing to start on. It needs no decisions, it cannot go wrong, and it clears
six of the 44 stubs.

### The one hard deadline

*The Hero Moment*'s provided gist — stub #44 — **cannot be authored live**. The chained workflow and its
cron trigger must exist and be proven to run **before filming**, or the lesson has no payoff. Everything
else in Part Two is a diagram.

---

## Part 5 — CVM rewords this plan forces

Each of these is a place where the repo and the recorded beat would otherwise disagree.

| Section / Lesson | Beat or description | Change to |
|---|---|---|
| Review L6 | "Ends with `CODING_STANDARDS.md` created" | "gains a rule" — the file is born on `main` |
| SF P1 L2 | quest *Wire A Single-Ticket Implementer* | "read this and predict what it does" — the workflow is seeded |
| SF P1 L3 | quest *Split Build From Review* | same |
| SF P1 L5 | quest *Wire The Explore Step* | same |
| SF P1 L4 | "Ends with `CODING_STANDARDS.md` exists" | "gains its first factory rule" |
| Codebase Design L8 | setup *Seed A Vibe-Coded Mess* | Delete. `main` is the mess now |
| Codebase Design L8, L10, L13 | descriptions say "module" | say "loader", and L10's fix is **extraction** |
| Codebase Design L11 | setup *A Deep Module With No Boundary Enforcement* | point at L10's own output |
| Codebase Design L16 | setup *Two Modules, One Real Adapter* | point at L10's date split |
| Feedback Loops L6 | setup names `app/services/userService.ts` | name the helper; import `~/db` directly |
| Review L2 | setup names `progressService.ts` | name the loader that absorbed progress |
| SF P2 L2 | quest *Parallelize The Queue* (`aa937cc1`) | **Delete.** It argues against the definition beat above it |

Two further Part Two changes were already agreed in round five and are recorded here so they are not
lost: the new lesson *The Parallel Ticket Queue* (`5d0c9fbc`) at position 7, and learning goal
`c29dfd6b` re-homed onto three of its beats and raised from priority 3 to 2.

---

## Part 6 — Risk

| Risk | Door | Guard |
|---|---|---|
| The worsening is wrong and `pnpm test` goes red | Two-way | `backup/main-pre-worsening-*`, pushed. The check is 377 green, 0 red |
| A duplicate slug reaches students | One-way in practice | The `uniq -d` check before every push |
| `seed-refund-feature` is bigger than expected | Two-way | It is one commit on `main`. It can be rebuilt without touching the stack |
| A reslug after filming | **One-way** | Slugs are frozen at creation. Pick all 44 now, while nothing is recorded |
| *The Hero Moment* gist is not ready | **One-way** | It is the only hard deadline. Build it early |

The stack is empty today, so **Phase 2 is a two-way door and costs nothing**. The one-way doors are the
slug names and the filming deadline. Both are settled by doing Phase 2 now.

---

## Part 6b — Filming notes produced by the build

Recorded as they were found. Each one is a thing a lesson script must know.

| Note | Lesson affected |
|---|---|
| **Re-seed on the filming day.** `pnpm db:seed` writes purchases at `daysAgo()` offsets. The 11 users who can see "Cancel my purchase" age out of the 14-day window as real time passes. | Domain Language L3 |
| **"Reversal" is in the terminal, not the browser.** No mail transport is wired, so `buildReversalEmail` is `console.log`ged. The student meets the third name in the dev-server output. Say so on camera. | Domain Language L3 |
| **Name Anika Bose (100% complete) and Caleb Ncube (78%) on camera.** Both bought inside the window, both see no button, and both would have a direct POST accepted — because the action copy of the rule is missing the completion check. A student reading the action alone cannot notice an *absent* check. | Domain Language L3 |
| **Do not say "negative offset reads as the next day."** It is backwards. A negative offset reads a late-evening UTC purchase as the *earlier* day; a positive offset reads it as the next. The off-by-one is real in both directions. | Domain Language L3 |
| **The `mutation-testing` skill was stripped with Stryker** and must re-land with the `stryker-pointed-at-diff` seed. | Feedback Loops L4 |
| **`.agents/skills/adding-a-route/` was deleted**, not reworded. It was crash-course leftover that told agents to build a service layer. | — |

---

## Part 7 — Open

Nothing blocks a start. Two things want a decision before their own tier:

- **The Refund feature's shape.** The three screen names are fixed by the beats. The schema is not.
  Tier 4.
- ~~**Which loader receives the analytics code.**~~ **ANSWERED 2026-09-22: fold `analyticsService.ts`
  into ONE route.** Not spread across the routes that call it. This keeps Codebase Design's extraction
  target sharp and large. The receiving route is the instructor analytics dashboard.


---

## Part 8 — Build record

Everything in Parts 1 to 4 is built and pushed. `origin/main` is `060ba96`;
`origin/live-run-through` is 44 commits on top of it, none empty.

### What is on `main` — five commits

| Slug | Result |
|---|---|
| `worsen-the-services` | `app/services/` deleted. 16 services inlined into 26 routes, duplicated. `analyticsService` folded into `instructor.analytics.tsx` alone, which is now 1,944 lines. 12 test files and 391 tests deleted. `testing-services` and `adding-a-route` skills deleted. `AGENTS.md` architecture rule removed. 377 tests still green. |
| `seed-refund-feature` | `refunds` table, migration `0009`, request flow. Three names for one thing. Eligibility chain written twice and drifted. A real timezone bug, reproduced in both directions. |
| `strip-stryker-from-main` | Config, script, npm script, devDeps, AGENTS.md section, README row, vitest exclusion, `.gitignore` block, and the `mutation-testing` skill. |
| `strip-screenshot-workflow` | `.github/` now empty, so the factory section's workflow is the repo's first. |
| `reset-coding-standards` | Joke line replaced with three real rules that collide with nothing later. |

### The stack — 44 commits, all filled

| Section | Stubs | Test count at section end |
|---|---|---|
| Domain Language | 7 | 377 |
| Wayfinder | 3 | 377 |
| Review | 7 | 377 |
| Feedback Loops | 12 | 378 |
| Codebase Design | 8 | 430 |
| Software Factory Part One | 6 | 430 |
| Software Factory Part Two | 1 | 430 |

The test count is the course's own arc. It does not move for four sections,
because nothing is testable. It rises by one when a lesson kills a mutant, then
by 52 when the student extracts a service out of a loader and earns the test
layer back.

### Decisions taken during the build

| # | Decision |
|---|---|
| B1 | **`GLOSSARY.md`, not `CONTEXT.md`.** Settled by the user mid-build. The skills will be updated to match. |
| B2 | `analyticsService` folds into **one** route, `instructor.analytics.tsx`. |
| B3 | The `mutation-testing` and `adding-a-route` skills are deleted on `main` with the code they document. The first re-lands as a Feedback Loops seed; the second does not come back, being crash-course leftover. |
| B4 | The Refund eligibility chain's action copy is **missing the completion check**, deliberately. Codebase Design's RFC finds it and ships the fix. |
| B5 | `app/services/` is reborn in `extract-a-service-from-a-loader`, under `app/services/`, with a dependency-cruiser boundary. |

### Things a human must still do

| What | Why |
|---|---|
| **Open the Admin Platform Analytics issue**, labelled `agent:implement-spec` | *The Hero Moment*'s workflow reads its spec from that issue. Without it the finale has nothing to chain. |
| **Set the repository secrets** — `ANTHROPIC_API_KEY`, `FACTORY_PAT` | `FACTORY_PAT` is the one that makes the chains chain; the built-in token cannot start another workflow. |
| **Create the human-applied labels** — `agent:implement`, `agent:review`, `agent:explore`, `agent:implement-spec` | The workflows create their own machine labels, not these. |
| **Re-seed on the filming day** — `npm run db:seed` | Refund window fixtures age out of 14 days. |
| **Re-sync the in-repo skill copies** once the skills repo learns `GLOSSARY.md` | The copies under `.agents/skills/` still say `CONTEXT.md`. |
| **Apply the CVM rewords** in Part 5 and Part 8b | Otherwise the video and the repo disagree. |

### Part 8b — further CVM rewords the build found

| Section / Lesson | Disagreement |
|---|---|
| Domain Language L7 | Says the glossary carries "the timezone ADR". There is none; the soft-delete ADR is the section's first. |
| Domain Language L5 | Says "admins"; the guard is `requireStaff`, which admits the owning instructor too. |
| Review L2 | Names `progressService.ts`, which no longer exists. The drift habit is in the route that absorbed progress. |
| Review L6 | Says `CODING_STANDARDS.md` is created. It already exists; the lesson appends a fourth rule. |
| Review L7 | "Scoped branches" was built as scoped files beside the directories they govern. |
| Feedback Loops L2 | PR #5's rule targeted `app/services/*`, which is gone. A different rule was written for the drift the lesson plants. |
| Feedback Loops L3 | *The CRAP Score* targets `app/services`, which does not exist at that point. Not filmed, so not built. |
| Codebase Design L11 | The skill is `setup-ts-deep-modules`, not `setup-deep-modules-ts`. Named backwards twice. |
| Codebase Design L8/L10/L11 | Say "module" where the repo has a loader, and "narrowing" where the work is extraction. |
| SF Part One L3 | Says "only the implementer workflow"; the agent-browser workflow is also there. |
| SF Part One L4 | Says `CODING_STANDARDS.md` gains its **first** rule. It has six by then. |
| SF Part Two L1 | Says the file carries one rule. It carries seven. |
| SF Part Two L6 | The gist needs two files — the workflow and `.github/schemas/spec-decomposition.json`. |
