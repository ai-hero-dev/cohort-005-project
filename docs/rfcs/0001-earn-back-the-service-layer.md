# RFC 0001 — Earn back the service layer

Produced by `/improve-codebase-architecture`. The skill's HTML report is
written to the temp directory and is gone by the next reboot; this is the part
that was worth keeping.

Vocabulary is the one in the `codebase-design` skill — **module**, **interface**,
**implementation**, **depth**, **seam**, **adapter** — and the domain words are
`GLOSSARY.md`'s.

## The finding

This codebase has almost no modules. It has routes, and inside the routes it
has everything: the queries, the rules, the arithmetic and the copy. Sixteen
things that used to be services were folded back into the loaders and actions
that called them, and where two routes needed the same one, it was folded into
both.

That produces two costs, and they compound.

**Nothing is testable.** A rule inside a loader can only be reached through a
`Request`, a router context and a matched route. There is no seam, so there is
no test — not a weak test, no test at all. `app/lib/` and `request-logger/` are
the whole of what the suite reaches, and neither holds a business rule.

**Every rule has as many copies as it has callers, and the copies drift.** This
is not a prediction. One of them has already drifted, and it is a bug today.

`app/services/refund-window/` is the first module back, and the shape it uses
(entry points at the root, implementation in `lib/`, tests in `tests/`) is the
shape the candidates below assume.

## Candidate 1 — The Refund Policy is written twice, and the copies disagree

**Strength: Strong. This is the top recommendation.**

**Files:** `app/routes/courses.$slug.tsx` (`getRefundOffer`, and the five
constants above it), `app/routes/courses.$slug.refund.ts` (the action).

**Problem.** `GLOSSARY.md` says the Refund Policy is five conditions, all of
them or no Refund: inside the fourteen-day window, under half the Course
completed, under two hours watched, no Seat claimed from it, and the amount
given back is the amount actually paid.

The course page checks five. The action that actually creates the Refund checks
**four** — it never asks how much of the Course the Learner has completed. So a
Learner who has finished the whole Course is correctly not offered the button,
and can still post the form and get a Refund. The page and the action are two
implementations of one idea, and this is what "the copies drift" looks like
when it has finished drifting.

There is more of the same underneath. `asUtcDayString` and `calendarDay` are
the same four-line function under two names. `REFUND_WINDOW_DAYS` is declared
in two files. The watch-time query — `max(position_seconds)` per Lesson, summed
— is written out in full in both, and a third route writes it again for one
Lesson.

**Solution.** One module, `app/services/refund-policy/`, that answers the
question the Policy asks: _may this Learner have their money back, and how
much?_ It takes the facts as plain values and returns a decision — eligible
with an amount, or refused with which of the five conditions refused it. Both
callers ask it. The page turns a refusal into a hidden button; the action turns
the same refusal into a thrown response. Neither of them knows what fourteen
means.

The Policy needs to know what day it is, and that is the seam that has to be
deliberate: the module must never read the clock itself, or it goes straight
back to being untestable. Give it a **`Clock`** — an interface with one method,
"what day is it" — and hand it in. Production passes the system clock; a test
passes whatever day it wants to talk about.

**Benefits.** _Locality_: the five conditions sit in one file, in the order the
glossary lists them, so the answer to "what is the Refund Policy" is a file
rather than a search. _Leverage_: a sixth condition is one edit, not a hunt for
every caller. _Tests_: the whole Policy comes under test through one function —
every condition, every boundary day, both prices. None of those tests can be
written today.

**The deletion test.** Inline this module back into its two callers and the
complexity concentrates in it, not in them: the day arithmetic, the completion
fraction, the seat check and the price choice all belong to the same idea.
That is a yes.

## Candidate 2 — `instructor.analytics.tsx` is a module wearing a route's clothes

**Strength: Worth exploring.** Do it after candidate 1, and do it a piece at a
time.

**Files:** `app/routes/instructor.analytics.tsx`, about two thousand lines.

**Problem.** Ten query functions, each with a named idea behind it — revenue
over time, top buyers, the drop-off funnel, quiz pass rates, revenue by
country — and a loader that calls all of them. The file is four times the
length the root `CODING_STANDARDS.md` allows, and none of it can be called.

The refund-window extraction has already shown the shape: the query stays with
the route, the arithmetic over the rows moves out and comes under test.

**Solution.** Take one panel at a time, smallest first. Revenue by country is
the next best candidate: it is pure arithmetic over rows once the query has
run, it owns rounding rules that nothing currently checks, and it already reads
`getDiscountForCountry` from `app/lib/ppp.ts`, so its dependencies are already
callable.

**Do not do this as one refactor.** Ten extractions in one diff is a rewrite
with no green step in the middle.

## Candidate 3 — Watch Time is computed in three places

**Strength: Worth exploring.**

**Files:** `app/routes/courses.$slug.tsx`, `app/routes/courses.$slug.refund.ts`,
`app/routes/courses.$slug.lessons.$lessonId.tsx`.

**Problem.** Watch Time is defined in `GLOSSARY.md` as the furthest point a
Learner reached in each Lesson video, added up. The query that implements that
sentence — `max(position_seconds)` grouped by Lesson, then summed in
TypeScript — is written out three times. It is correct in all three today,
which is the most fragile state a duplicated rule can be in.

**Solution.** Candidate 1 takes the first two, because both are asking the
Refund Policy's watch-time question, and the answer should come back the same
for both or the Policy is not one Policy. The lesson page's copy is asking
about one Lesson rather than a whole Course, so it is the same sentence at a
different scope: fold it in once the first two agree, not before.

## Candidate 4 — The notification bridge is copied into every route that notifies

**Strength: Speculative.**

**Files:** `app/routes/courses.$slug.refund.ts`, `app/routes/admin.refunds.tsx`,
`app/routes/courses.$slug.lessons.$lessonId.tsx`.

**Problem.** `publishNotificationToAbly` is thirty-five lines, and it appears
three times, byte for byte: read the key, skip if absent, POST, swallow the
failure. Each copy is paired with a `db.insert(notifications)` that is also
written out each time.

**Solution.** A `notifications` module with one entry point: write the row,
then try the bridge. This is marked speculative rather than strong because the
duplication is stable — nobody edits it — and because the vendor call is the
one piece here that a test cannot reach without a second seam. Worth doing when
somebody next touches it, not as a piece of work of its own.

## Considered and not recommended

**`app/lib/access.server.ts`.** It was looked at and left alone. ADR-0016
records the inline-check era and is already deprecated; the shared helpers
replaced it and are doing their job. Nothing here re-opens that.

**Anything under `app/components/`.** Out of scope. The friction in this
codebase is behind the loaders, not in what renders.

## Sequence

1. Candidate 1, the Refund Policy, with the `Clock` seam it needs. It closes a
   live bug, and it is the first business rule in this codebase with a test.
2. Candidate 2, one analytics panel, to prove the pattern holds for a route
   nobody wants to touch.
3. Candidates 3 and 4 fall out of the two above, or wait for a reason.
