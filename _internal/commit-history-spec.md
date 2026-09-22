# Cohort 005 — Commit History Spec

Status: **decisions record**, not yet executed. Part F is now answered; the build order lives in the companion `implementation-plan.md`. Written 2026-09-22 after six rounds of iteration.

This document is the source of truth for the Cohort 005 commit history. Where it conflicts with
the `editing-course-repos` skill, **this document wins** — the skill is stale.

Naming note: section numbers have drifted between rounds. This spec uses **section names only**.
Do not trust a bare "Section 7" in any earlier report.

---

## Part A — Governing decisions

| # | Decision | Source |
|---|---|---|
| A1 | The repo starts **bad**. The worsening lands on `main` itself, not a seed commit at position 0. "Just start from the bad point." | user, round 4 |
| A2 | **No survivors.** Every service is folded into loaders — including `analyticsService.ts` and `commentService.ts`. No prior art for modularisation is left anywhere in the repo. | user, round 6 |
| A3 | **Weaken the documentation that promotes services.** `AGENTS.md`'s route → service → Drizzle rule is part of the worsening, not protected from it. | user, round 6 |
| A4 | Tests must become **unwritable**, not failing. A failing test is an invitation; an unwritable one is a wall, and the wall is the point. | user, round 5 |
| A5 | The **83 pure tests** in `app/lib/` survive. They are pure functions, not services, so A2 does not reach them. | user, round 5 |
| A6 | The repo is **private and totally malleable**. No breaking-change cost, no cutover, no migration. | user, round 5 |
| A7 | **Minimise cross-section dependencies.** Refilming breaks when a section depends on a commit far before it. Each section should stand on its own seed. | user, round 2 |
| A8 | `CODING_STANDARDS.md`: each section writes whatever state it needs. Not militant about cumulative rewrites. "Healthy when we want it healthy, unhealthy when we want it unhealthy." | user, round 3 |
| A9 | Issue bodies (Wayfinder maps, ticket queues) live in **gists**. The student copies them into GitHub themselves. No `seed-issues.ts`. | user, round 2 |
| A10 | `main` is freely modifiable. The CLI reads `upstream/main`, so a `main` edit reaches students once pushed. | user, round 2 |
| A11 | Work **locally**, not through PRs. Too many history manipulations for PRs to be manageable. | user, round 6 |
| A12 | Use **Ably**. The point of the lesson is seeing Wizard help with a third-party vendor. | user, round 3 |
| A13 | Software Factory Part One collapses to **one feature**: implement it, review it, retro it. | user, round 3 |
| A14 | Software Factory Part Two's Admin Platform Analytics **needs no spec written now** — tickets and spec are authored live on camera. Any spec will do. | user, rounds 5, 6 |
| A15 | **No CI lesson.** | user, round 5 |

---

## Part B — What lands on `main`

`main` is the student's starting clone. It must be the bad start point.

### B.1 Already done

| Commit | State |
|---|---|
| `fix-upstream-url` — point `--upstream` at `cohort-005-project.git` in all three scripts, plus `AGENTS.md` and `request-logger/agents.ts` | **MERGED** (PR #7) |
| Bump `ai-hero-cli` to 0.9.0, for `reset --unstaged` | **MERGED** (PR #8) |
| Delete two false README claims — the Ably line, and React Router v7 → v8 | **MERGED** (PR #9) |

### B.2 The worsening — `worsen-the-services`

The single most important commit in the course. One commit on the tip of `main`.

1. **Fold every service into its route loader or action.** All 16 files in `app/services/`. Where two
   routes call the same function, copy it into both — the duplication is the point.
2. **`analyticsService.ts` and `commentService.ts` go too.** They are the two genuinely deep,
   well-documented modules, which is exactly why they cannot stay: they would be prior art. (A2)
3. **Delete every service test file.** There is nothing left to import.
4. **Weaken `AGENTS.md`.** Remove line 1's route → service → Drizzle rule, and line 34's pointer at the
   `testing-services` skill. The repo must not document a discipline it does not practise, because that
   discipline is what the course teaches later. (A3)
4b. **Delete `.agents/skills/testing-services/`.** It teaches the mock-`~/db`-then-import pattern by
   name — the exact seam this commit destroys. Deleting the services but keeping the manual that explains
   them is the worst of both. (F1)
5. **Do not touch `app/lib/`.** All 83 pure tests survive. (A5)
6. **Leave `redeem.$code.tsx` and `instructor.$courseId.students.tsx` alone.** They already import
   Drizzle into the route and duplicate a rule the service owns. After the worsening they stop being
   exceptions and become the house style.

**Why the tests become unwritable, not failing.** The tests are already DB-coupled and do not mind:
`app/test/setup.ts` spins a real in-memory SQLite, runs the real migrations, and every service test
does `vi.mock("~/db", ...)` then imports the service directly. So the seam is two halves — `~/db` is
one swappable module, *and* a service is an importable function. Folding into a loader destroys the
second half. A loader needs a `Request`, a router context and a matched route. There is nothing left
to import and call. Nothing goes red; the tests simply stop being possible to write.

**Measured cost** (from `origin/main`): ~4,000 lines of service code moved, ~5,000 lines of test code
deleted, ~384 service tests gone, 83 pure tests kept, 26 routes available to receive the code.

### B.3 Other `main` seeds, still to do

| Slug | What |
|---|---|
| `seed-refund-feature` | The Refund feature with its naming drift across three screens, plus the 14-day window's UTC bug. Feeds Domain Language, composes into Codebase Design's date seam. **O1 answered: yes, seed it.** Built *after* the worsening, so it is built in the new bad house style. |
| `strip-stryker-from-main` | Remove PR #1's Stryker config. It re-lands as a Feedback Loops seed. |
| `strip-screenshot-workflow` | Remove PR #2/#3's screenshot machinery. It re-lands at Feedback Loops. |
| `reset-coding-standards` | Write `CODING_STANDARDS.md` with two or three real rules carried over from the Crash Course. **No joke line.** |

### B.4 Deliberately left alone on `main`

The switcher bug (`dev-ui.tsx:45` — `setOpen(false)` is never called, and `DevUI` renders outside the
`<Outlet/>` so it never unmounts), `ppp.ts`'s four-function pass-through, the orphaned-but-settable
`CourseStatus.Archived`, and the missing indexes. All four are load-bearing later, and all four are
free because they are already there.

---

## Part C — The lesson stack

`live-run-through` = `main` plus a linear stack of lesson commits, one per lesson, in teaching order.

**Today the stack is empty.** `origin/live-run-through` is a single root commit, `106f759 "Initial"`,
and `main` is 23 commits ahead of it. Nothing needs migrating, reslugging or preserving. This is the
cheapest possible moment to build the stack.

**Commit message contract:** `<slug>: <Human title>`. Lowercase kebab-case slug, first colon is the
parse boundary. `ai-hero-cli` parses it to power `reset`, `cherry-pick` and `pull`. Slugs must be
unique across the stack, and are named for **what the commit does to the tree**, not for the lesson.

**Kinds:** `SEED` = built before filming, lands as a commit. `LIVE` = built on camera, still needs a
commit so later lessons can start from it. `GIST` = a gist link only, per A9.

### Before We Start / Domain Language

| Slug | Kind | What |
|---|---|---|
| `add-grill-and-domain-skills` | SEED | `grill-with-docs` and `domain-modeling` in one seed. |
| `seed-bloated-glossary` | SEED | Time-skip: a `glossary.md` that looks like months of accretion. Only ever seedable. |
| `seed-adr-pile` | SEED | Time-skip: `docs/adr/` with enough entries to be a problem. |

### Wayfinder

| Slug | Kind | What |
|---|---|---|
| `add-wayfinder-skill` | SEED | Brings `wayfinder` plus its dependencies `prototype` and `research`. |
| `add-wizard-skill` | SEED | `wizard`. Not a Wayfinder dependency, so separate. |
| `add-pr-skill` | SEED | `pr`. |
| `wayfinder-map-gist` | GIST | The Wayfinder issue bodies as a gist. |
| `ship-in-app-notifications` | LIVE | L9 Spec → Implement. Notification data model, **Ably** wired, notification UI. One commit, not three — the student never lands mid-lesson, because the quest is to build it themselves. |

**Ably needs no strip.** It was never in this repo. The only trace was the false README line, now
deleted by PR #9. Ably is chosen by the research subagent in L4, provisioned by Wizard in L7, and
wired in L9 — exactly where the CVM already puts it. Starting from genuine zero is better than
starting from a stripped state.

**Withdrawn:** the concurrent-connection caution. Each student provisions their own account through
the Wizard, so the free-tier limit is per student, not per cohort.

**Lessons L2–L8, L10–L12 change nothing on the tree.** Wayfinder's middle is GitHub issues.

### Review

| Slug | Kind | What |
|---|---|---|
| `add-code-review-skill` | SEED | `code-review`. |
| `add-retro-skill` | SEED | `retro`. Software Factory Part One needs it too. |
| `coding-standards-review` | SEED | Writes the file in whatever state this section needs. (A8) |

`CODING_STANDARDS.md` is born on `main` now, so reword the CVM lesson from "created" to "gains a rule".

### Feedback Loops

| Slug | Kind | What |
|---|---|---|
| `coding-standards-feedback-loops` | SEED | The section owns its own standards file, so it depends on nothing before it. (A7) |
| `husky-lint-staged-oxlint` | SEED | PR #5's shape: husky, lint-staged, `check-file-size.sh`, oxlint. |
| `route-out-of-sync` | SEED | Break one entry in `app/routes.ts`. All 29 routes match files today, so the drift must be planted. |
| `custom-lint-rule` | LIVE | The oxlint JS plugin rule, written on camera. |
| `stryker-pointed-at-diff` | SEED | PR #1's Stryker, re-landed after being stripped from `main`. |
| `kill-one-survivor` | LIVE | The new test, written live. |
| `db-import-in-client` | SEED | A db-only import into `dev-ui.tsx` via `userService`, killing hydration. |
| `hydration-loop` · `move-the-helper` | LIVE | Build the console-capturing loop, then fix it. |
| `agent-browser` | SEED | PR #6 plus the orphaned PR #4, extended to read the DOM. |
| `fix-switcher-with-eyes` | LIVE | Fix the switcher bug and let the agent verify itself through the DOM. |

**Cut:** the coverage/complexity ceiling and the CRAP score. **Cut:** seeding the switcher bug — it is
already on `main`, six sections of free irritation.

### Codebase Design

**This section is the one most changed by A2, and it changes for the better.** See Part E.

| Slug | Kind | What |
|---|---|---|
| `add-deep-modules-skill` | SEED | `setup-deep-modules-ts` and `improve-codebase-architecture`. |
| `untestable-date-dependency` | SEED | The date module. No API key, no dev-server complication, composes with the Refund 14-day window, and the merge lesson needs this seam later. |
| `extract-a-service-from-a-loader` | LIVE | Narrow one bloated loader behind a seam and test it. |
| `wire-deep-module-boundary` | LIVE | Point `setup-deep-modules-ts` at the narrowed module. |
| `rfc-to-spec` · `rfc-to-tickets` | LIVE | RFC → spec → tickets → shipped, consuming the live output. |
| `collapse-ppp-passthrough` | LIVE | `app/lib/ppp.ts` — collapse four forwarding functions into one. |
| `merge-date-modules` | LIVE | Merge them back, test as a larger unit. |

**Cut:** seeding a vibe-coded mess (the worsening on `main` is now far worse than any seed).
**Cut:** the architecture RFC seed (students use their own generated version).
**Cut:** the "deep module with no boundary enforcement" seed and the "two modules, one adapter" seed
— both are satisfied by the section's own earlier live output.

`app/lib/access.server.ts:103-150` is the free contrast case: `requireContentAccess` and
`requireStaff` look like pass-throughs and are not — the throw is the added abstraction. "Looks like a
pass-through, is not" is a better beat than the pass-through itself.

### Software Factory Part One

**One feature, three lessons** (A13): implement it, review it, retro it.

| Slug | Kind | What |
|---|---|---|
| `factory-ticket-gist` | GIST | The tickets as one gist. |
| `add-implementer-workflow` | SEED | `.github/workflows/agent-implement.yml`. Seeded, then explained live — the YAML is long and typing it teaches nothing. |
| `add-review-workflow` | SEED | `.github/workflows/agent-review.yml`. |
| `add-coding-standards-factory` | SEED | The file in whatever state this section needs, before the retro adds to it. |
| `add-explore-workflow` | SEED | `.github/workflows/agent-explore.yml`. Read-only, comments on the issue. |
| `branch-explore-workflow` | LIVE | The explore workflow branches on its own verdict. |

**Reword three CVM quest beats.** Because the workflows are seeded, "Wire A Single-Ticket Implementer"
now means "read this and predict what it does", not "write this". Otherwise the video and the repo
disagree.

**The feature: coupon expiry windows.** The `coupons` table is a *seat* coupon, not a discount code —
it has `code`, `purchaseId`, `redeemedByUserId`, `redeemedAt`, and no validity window at all. So a
team admin buys seats and an unredeemed seat is good forever. It touches schema, migration, the
redeem guard chain, `redeem.$code.tsx` and `team.tsx` — enough surface for a review to have opinions
about, small enough for one implementer run.

**The review does not need real findings** (user, round 4). By this point the student has had a whole
section on reviews. The lesson's job is to show the second workflow runs, posts a verdict, and is
memory-less. Its own beats never ask for the review to be correct, and false positives are expected.

Three findings are *likely* anyway, as a bonus rather than a requirement: the expiry check is
untestable because there is no clock abstraction anywhere (`new Date()` inline at 15+ sites); the new
rule gets duplicated into the route, because duplication is now the house style; and a new admin
route forgets `requireStaff`, which is used in exactly one place in the whole repo.

**One optional extra ticket**, explicitly droppable: "notify the team admin 7 days before an
unredeemed seat expires", calling the notification service the student built in Wayfinder. The core
feature stands alone without it, so this is a soft edge, not a dependency. (A7)

**Lessons that change nothing:** L0 (concept only) and L1 (secrets and a PAT are GitHub settings; the
`permissions:` block arrives with the first workflow file in L2).

**The coupon feature is never merged into the stack.** L5 opens with "implementer, review and
`CODING_STANDARDS.md` in place" and never names the feature. That is what lets one feature serve three
lessons without a commit.

**Knock-on from the worsening:** after it, `pnpm test` runs 83 pure tests and touches none of the
feature. So "a run that actually passed" in *Retro A Passing Run* means the review agent passed it,
not the tests. That is a sharper lesson, not a broken one — and the natural first rule the retro
writes is about testability, so the repo spends the rest of the course earning its tests back.

### Software Factory Part Two

| Slug | Kind | What |
|---|---|---|
| `analytics-queue-gist` | GIST | The ticket queue as a gist. **Authored live** (A14). |
| `add-implement-spec-workflow` | SEED | *The Hero Moment*'s "provided gist" — the chained workflow plus its cron trigger. |

**Only *The Hero Moment* changes the tree.** Every other lesson in this section is diagram or
whiteboard work, which is correct and needs no commits.

**The feature: Admin Platform Analytics.** Named by two independent sources — the CVM's own quest, and
the repo's backlog at `_internal/feature-ideas.md:13`. The spec is lifted from a file already in the
repo, not invented for the course.

**The tickets are written live** (A14), so what follows is a shape to aim at, not a contract:

```
T1 refunds ──┐
             ├─→ T3 rollup ─┬─→ T4 CSV export
T2 date range┘              └─→ T5 cron: generate last month
                                   │
                                   ▼  nightly run is slow
                             slow-query detector
                                   │
                                   ▼  files its own ticket
                                  T6 add the missing indexes
                                   │
                                   ▼
                             self-filing fix PR
```

T6 is the hero moment and it is deliberately **not** in the spec. Only five indexes exist in the whole
schema and none covers `purchases.created_at` or `courses.instructor_id`, so every date predicate in
the new report is an unindexed table scan — guaranteed, not hoped for. The detector fires on work the
factory has just done, the system writes a ticket about itself, and the self-filing fix PR closes it.
That turns the diagram exercises in the three lessons before it into diagrams of something that then
happens for real.

**New lesson: The Parallel Ticket Queue** (`5d0c9fbc`), created in round five. Whiteboard only,
nothing in the repo changes. Placed at position 7, after *The Hero Moment* — asking how to parallelise
a queue the student has watched run is a design review, not a thought experiment. It gives the section
a two-step ending: this lesson generalises the repo's own system, and *Whiteboard Your Own System*
generalises away from the repo. Learning goal `c29dfd6b` is re-homed onto three of its beats and
raised from priority 3 to 2.

**Deleted:** the quest *Parallelize The Queue* from *Implement Spec* (beat `aa937cc1`). The lesson's own
definition beat is "Two Loops: Decompose, Then Chain" — a parallelism quest argued against the beat
sitting six inches above it.

**Hard deadline.** The tickets and spec are authored live, but *The Hero Moment*'s provided gist cannot
be. The chained workflow and its cron trigger must exist and run **before filming**, or the lesson has
no payoff.

---

## Part D — Mechanism and process

### D.1 `reset --unstaged`

Shipped in `ai-hero-cli` 0.9.0 (PR #82, #83), adopted by the project in PR #8. Renamed from `--demo`
at the user's request. It rewinds `HEAD` to the parent, leaves the lesson's tree in place, and leaves
the diff unstaged — so the student reviews a diff and opens their own PR rather than receiving the
work as history. The discard warnings are no longer skipped.

### D.2 Build order

| Tier | Work | Blocks |
|---|---|---|
| 0 | **The worsening on `main`**, plus the three remaining `main` seeds | Everything |
| 1 | The missing skills. Zero decisions needed, pure copying from the skills repo | Nothing — start any time |
| 2 | Lay down the stub commits on `live-run-through` | The stack |
| 3 | Cherry-pick PRs #5, #6 and the orphaned #4 into Feedback Loops seeds | Feedback Loops |
| 4 | The three gists — Wayfinder map, Factory tickets, Analytics queue | Three sections |
| 5 | Fill the stubs, one at a time | Filming |
| 6 | Reword the CVM beats this spec changes | Filming |

### D.3 Local mechanics

Work locally with plain git (A11). `reset`, `cherry-pick` and `pull` are *student navigation* — they
refuse the protected branches and will force-delete a local `live-run-through` to re-track upstream.

Before any history rewrite, cut a backup branch **and push it**. A local-only backup does not survive
a discarded workspace.

The stack is empty today, so building it discards nothing:

```
git checkout -B live-run-through main
git commit --allow-empty -m "<slug>: <Title>"   # one per tree-changing lesson, in teaching order
git log main..live-run-through --reverse --format='%s'   # verify the contract
git push --force-with-lease origin live-run-through
```

`ai-hero-cli internal add-commit`, `edit-commit` and `rename-commit` do this too, and `edit-commit`
replays everything downstream — but all three are **interactive TUIs**, so they need a human at a
keyboard.

---

## Part E — Consequences of A2 that need a decision

Folding *every* service, including the two deep ones, has knock-ons that the earlier rounds had not
priced. None of them is a blocker. All of them make the course better, but they change what three
sections are about.

**E1 — Codebase Design gets a stronger arc, and a different one.** Its lessons were built around
hunting shallow modules: `quizService` with 28 exports of which 18 are dead, and the 1,050-line
`analyticsService`. After the worsening **there are no services left to hunt**. The section's target
becomes the bloated loader instead, and *Testing The Untestable* becomes literally true rather than
figuratively. The fix flips from "narrow this module" to "**extract a service out of this loader**" —
which means the course now teaches the student to *build* the service layer the worsening destroyed.
That is a better story than refactoring a module that was handed to them. The lesson descriptions and
several beats need rewording to match.

**E2 — Section 8's "this is why we did that" callback is dead.** Round three planned for Codebase
Design to refactor `analyticsService.ts`, with the factory then building on the refactored version.
`analyticsService.ts` no longer exists as a module. The callback should simply be dropped — A14 says
any spec will serve, so nothing is lost.

**E3 — The contrast argument is withdrawn.** I argued the two deep modules should survive as a
yardstick. That is overruled: no prior art (A2). The yardstick, if one is wanted, is `app/lib/` — 83
passing tests on pure functions, sitting next to a route layer nobody can test.

---

## Part F — Open questions, now answered

All four were answered 2026-09-22. See `implementation-plan.md` for what each one costs.

| # | Question | Answer |
|---|---|---|
| O1 | Is the Refund feature seeded on `main`, or built as Section 8's ticket T1? | **Seeded on `main`.** It feeds Domain Language. `git grep -il refund origin/main -- app/` returns nothing, so this is a feature built from zero, not a move. |
| O2 | Does anything replace `analyticsService.ts` as Codebase Design's subject? | **Yes — the bloated analytics loader.** The section becomes extraction, not narrowing. |
| O3 | Codebase Design's CVM lesson numbering | **Ignored.** Not a problem to solve. |
| O4 | Which sections need stub commits? | **Every LIVE bit gets its own stub.** One stub per quest or playthrough that changes the tree. This gives **44 stubs**. |

### Three findings that came out of answering them

| # | Finding | Consequence |
|---|---|---|
| F1 | `.agents/skills/testing-services/SKILL.md` teaches the mock-`~/db`-then-import-the-service pattern by name. | It is the purest prior art in the repo. **Delete it in the worsening**, with `AGENTS.md` line 34 that points at it. (A2, A3) |
| F2 | The `code-review` skill is **already on `main`**, as are `to-spec`, `to-tickets`, `implement`, `grill-me`, `grilling` and `tdd`. | Drop the planned `add-code-review-skill` seed. One less stub. |
| F3 | `main` carries Stryker (`stryker.conf.mjs`, `scripts/mutate-diff.ts`) and the screenshot machinery (`.github/scripts/screenshot-dashboards.sh`, `frontend-screenshot-poc.yml`). | Both strips in Part B.3 are confirmed real work, not assumed. |

---

## Part G — Claims withdrawn during these six rounds

Recorded so they are not re-proposed.

| Claim | Why it was wrong |
|---|---|
| Do not use a notification vendor; build it | The point of the lesson is watching Wizard help with a third-party vendor. Ably it is. |
| Ably's free tier caps concurrent connections for the cohort | Each student provisions their own account, so the limit is per student. |
| Put the worsening in a seed commit at position 0 | A medium start point followed by a bad one is a wasted step. `main` is where it goes. |
| The review lesson only works if the review has something real to say | Its own beats never ask for correctness, and false positives are expected. |
| Add a CI lesson | The fact was real — one `workflow_dispatch`-only workflow exists — but no beat asks for it, and it teaches nothing about agents. |
| `analyticsService.ts` and `commentService.ts` should survive as contrast | No prior art. They go. (A2) |
| Do not weaken `AGENTS.md`'s architecture rule | The rule is part of the worsening. (A3) |
| CVM beats carry `id: null` | `beat list` returns real ids. |
| The `editing-course-repos` skill is authoritative here | It is stale. This document supersedes it. |
