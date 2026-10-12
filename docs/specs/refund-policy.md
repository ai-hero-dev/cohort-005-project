# Spec: One refund policy

From `/to-spec`, on candidate 1 of the `/improve-codebase-architecture`
report. Broken into tickets by `/to-tickets`; the breakdown is at the bottom.
Published to the tracker with `ready-for-agent`.

## Problem Statement

The refund policy is four conditions: inside the fourteen-day window, under
half the course completed, under the Watch Limit, and no Claimed Seat on the
Purchase. All four, or no Refund Request.

Nobody can ask the policy a question without a database. The four conditions
live in `findRuleBreaks`, a private function in `app/lib/refunds.server.ts`,
among the queries that gather the facts it needs. Testing the fourteenth day
means seeding a Purchase, picking a `Date`, and going through
`checkRefundRequest`.

The fourteen days are judged twice. `refunds.server.ts` has `calendarDay`,
`lastDayOfWindow` and a private `isWithinWindow`; `instructor-analytics`
borrows the first two and judges the window itself, with its own days-left
arithmetic. The two have already drifted apart: the course page refuses a
Purchase dated after today, and the analytics page counts the same Purchase as
revenue that can still be refunded.

The numbers live in a third file. `app/lib/refund-rules.ts` holds the window,
the Watch Limit and the completion limit, so that the Platform Admin's review
page can label a broken rule without importing the database.

Nobody wrote a bug on purpose. The policy is one idea living in three files,
and none of them is the policy.

## Solution

One refund policy, in one place, that every caller asks.

The course page, the team page, the refund action and a Platform Admin's
review queue all get their answer from the same function, which takes plain
facts and a clock. The fourteen days are counted once, in one module that the
analytics page shares. And the next condition somebody adds is added once.

Nothing changes for a buyer the policy already allows.

## User Stories

1. As a Student, I want the refund button to appear exactly when a Refund
   Request would be accepted, so that I am not told one thing by the page and
   another by the form.
2. As a Student who has completed half a course or more, I want to be told
   that is why I cannot raise a Refund Request, so that I do not think the site
   is broken.
3. As a Student who has reached the Watch Limit, I want the same.
4. As a Student whose fourteen days have run out, I want to be told the window
   has closed, and not something vaguer.
5. As a Team Admin with a Claimed Seat on a Team Licence, I want to be told the
   Seat belongs to the Student who claimed it, so that I know why.
6. As a buyer with an Open Refund Request, I want to be told it is already
   open, rather than raising a second one.
7. As a buyer, I want the amount offered back to be exactly what I paid, on
   the page and in the email.
8. As a Student who bought at 23:00 on the first, I want the whole of my
   fourteenth day.
9. As a Student, I want the same answer wherever in the world I ask from.
10. As a Platform Admin, I want the rules a Refund Request breaks to be judged
    by the same policy the buyer was, on the day they raised it.
11. As an Instructor, I want the refund window on my analytics page to be the
    same fourteen days the course page offers.
12. As a developer, I want the refund policy to be one function I can call, so
    that I can read the four conditions in one screen.
13. As a developer, I want each condition under test at its boundary, without
    a database, so that changing one of them tells me which behaviour I
    changed.
14. As a developer, I want to be able to ask the policy about any day, so that
    testing the window does not mean waiting fourteen days or mocking a global.
15. As a developer adding a fifth condition, I want to add it in one file, and
    have every caller honour it without being edited.

## Implementation Decisions

**One module, `refund-policy`.** It holds the four conditions and nothing else.
Its interface is two functions over the same facts. `decideRefund` answers a
buyer: facts in, decision out. `findRuleBreaks` answers a Platform Admin:
every condition the Purchase fails. `refunds.server.ts` calls both.

**The policy takes facts, not a database.** The caller runs the queries — they
are already written, in `refunds.server.ts` — and passes plain values: when the
Purchase was made, what was paid, the buyer's figures, and the Refund Requests
already on it. The policy neither reads nor writes. That is what makes it
callable from a test.

**The figures are the ones the review page already shows.** An Individual
Purchase brings the buyer's lessons completed and seconds Watched. A Team
Licence brings its Seats and how many are claimed. The policy owns that type
now, and checks each kind against its own conditions.

**The decision is a discriminated union.** Eligible carries the amount, the last
day of the window and the days left. Refused carries which condition refused it
and what to tell the buyer. A caller cannot read the amount off a refusal.

**The order of the conditions is the policy's, not the caller's.** Which
refusal the buyer is shown is a decision, so it is made once, inside the
module, in the order `refunds.server.ts` already reports them. A Refund Request
already on the Purchase is reported first; it is not one of the four, and it is
the one a buyer is most likely to have hit.

**HTTP statuses stay out of the policy.** The policy says which condition
refused; `refunds.server.ts` maps that to 403 or 409. A domain module that
knows about status codes is a domain module with a second job.

**The labels move with the rules.** The Platform Admin's label for each broken
rule is exported by `refund-policy`, which imports nothing that touches the
database. `app/lib/refund-rules.ts` is deleted.

**Time comes in through a `Clock`.** A new `clock` module defines the seam — one
method, "what day is it", answering with a `YYYY-MM-DD` — and the adapter that
reads the machine. Nothing in the policy calls `new Date()`. `clock` also
owns the day arithmetic, so there is one place in the codebase that knows how
to add fourteen days. `refunds.server.ts` already takes `now`; it hands the
policy a clock stopped at that moment, and the review queue hands it a clock
stopped on the day the request was raised.

**The window is its own module, `refund-window`.** The fourteen days, the last
day of the window, whether a Purchase is inside it and how many days are left,
all on a `Clock`. `refund-policy` asks it, and so does `instructor-analytics`,
through its entry point. `refunds.server.ts` stops exporting its own.

**Whole calendar days.** Unchanged: the server's own calendar day, moved on
with `setDate`. Comparing `YYYY-MM-DD` strings is the comparison.

**A course with no lessons is not half finished.** Zero of zero is zero.

## Testing Decisions

A good test here calls `decideRefund` or `findRuleBreaks` and asserts on the
answer. It does not reach into `lib/`, and it does not know how many queries the
caller ran. The module's interface is its test surface: if a test needs
something the interface does not offer, the interface is wrong.

**Modules under test:** `refund-policy` — every condition at its boundary
(allowed one short, refused at exactly the limit), the order refusals are
reported in, the amount, and the whole-day counting at 23:00.
`clock` — the day arithmetic, across a month end and a leap day.

**What stays as it is:** `app/lib/refunds.server.test.ts`. It tests the
queries and the writes through a test database, and it must pass unchanged:
that is the check that every caller gets the answers it got before.

**What stays as it is, too:**
`app/modules/instructor-analytics/tests/instructor-analytics.test.ts`. The
refund exposure panel moves onto `refund-window` and must report the same
figures.

**Prior art:** `instructor-analytics`'s tests, the first tests of a loader
extracted into a module, and `app/lib/ppp.test.ts` for the table-driven style.

## Out of Scope

- The other candidates in the report.
- Approving and declining a Refund Request. A Platform Admin's decision is not
  the policy's, and the Claimed Seat check in `approveRefundRequest` stays.
- The notifications sent when a Refund Request is raised. Untouched.
- Any change to what an eligible buyer is offered.
- Any schema change. The policy reads columns that already exist.

## Further Notes

The two window counts disagreed about one thing only: a Purchase dated after
today. The course page refused it; the analytics page counted it. A Purchase is
stamped when it is made, so none can be dated after today, and the policy now
counts the window the way the analytics page did. No buyer loses something they
were being offered.

## Tickets

From `/to-tickets`. Each is a vertical slice; the numbers in **Blocked by** are
tickets in this list.

**1 — A `clock` module, and a seam for today**
_Blocked by: nothing._
The `Clock` type, the system adapter, and the calendar-day arithmetic, with
tests.
Prefactoring: nothing calls it yet, and nothing is deleted.

**2 — A `refund-window` module, and the analytics page asks it**
_Blocked by: 1._
The fourteen days on `clock`, as a module. `instructor-analytics` stops
borrowing `calendarDay` and `lastDayOfWindow` from `refunds.server.ts` and asks
`refund-window` with a clock stopped at its `now`. Its tests keep passing.

**3 — The refund policy, as a module with tests**
_Blocked by: 1, 2._
`refund-policy`, its four conditions, and the test that proves each boundary.
Nothing calls it yet, so this slice is green on its own.

**4 — Raising a Refund Request asks the policy**
_Blocked by: 3._
`checkRefundRequest` gathers the facts and maps a refusal to a status. The
course page, the team page and the refund action all go through it. Deletes
`calendarDay`, `lastDayOfWindow`, `isWithinWindow` and the refusal messages
from `refunds.server.ts`.

**5 — The review queue asks the policy**
_Blocked by: 3._
`listRefundRequestsForReview` asks `findRuleBreaks`, with a clock stopped on
the day each request was raised. Deletes the private `findRuleBreaks` in
`refunds.server.ts`.

**6 — Delete what is now unreachable**
_Blocked by: 4, 5._
`app/lib/refund-rules.ts`: the last copies of the window, the Watch Limit and
the completion limit outside the modules. The review page takes its labels from
`refund-policy`. `npm run lint:boundaries` and `npm run test` are the check
that nothing reaches past an entry point.
