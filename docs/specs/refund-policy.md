# Spec: One refund policy

From `/to-spec`, on candidate 1 of the `/improve-codebase-architecture`
report. Broken into tickets by `/to-tickets`; the breakdown is at the bottom.
Published to the tracker with `ready-for-agent`.

## Problem Statement

A Learner who has finished a Course cannot see the refund button — the course
page works out that the refund policy refuses them, and hides it. They can
still post the form, and the Refund is created.

The refund policy is four conditions: inside the fourteen-day window, under
half the Course completed, under the Watch Limit, and no team seat claimed from
the Purchase. All four, or no Refund.

The course page checks four. The refund action checks three. It has never asked
how much of the Course the Learner finished.

Nobody wrote that bug. Both places were written correctly at the time, and one
of them was changed afterwards. The policy is one idea living in two files, and
neither file knows the other one exists.

## Solution

One refund policy, in one place, that both callers ask.

A Learner who has finished more than half a Course is told so, whether they
found out by not seeing the button or by posting the form anyway. Admins stop
seeing Refunds that the policy should have refused. And the next condition
somebody adds is added once.

Nothing changes for a Learner the policy already allows.

## User Stories

1. As a Learner, I want the refund button to appear exactly when a Refund would
   be accepted, so that I am not told one thing by the page and another by the
   form.
2. As a Learner who has finished more than half a Course, I want to be told
   that is why I cannot have a Refund, so that I do not think the site is
   broken.
3. As a Learner who has reached the Watch Limit, I want the same.
4. As a Learner whose fourteen days have run out, I want to be told the window
   has closed, and not something vaguer.
5. As a Learner who claimed a team seat, I want to be told the seat belongs to
   whoever bought it, so that I know who to ask.
6. As a Learner with a Refund already waiting on an Admin, I want to be told it
   is already waiting, rather than raising a second one.
7. As a Learner, I want the amount offered back to be exactly what I paid, on
   the page and in the email.
8. As a Learner who bought at 23:00 on the first, I want the whole of my
   fourteenth day.
9. As a Learner, I want the same answer wherever in the world I ask from.
10. As an Admin, I want every Refund in the queue to be one the policy allowed,
    so that reviewing one is about the reason and not about the rules.
11. As an Instructor, I want a Learner who has taken the Course not to be able
    to take the money back too.
12. As a developer, I want the refund policy to be one function I can call, so
    that I can read the four conditions in one screen.
13. As a developer, I want each condition under test at its boundary, so that
    changing one of them tells me which behaviour I changed.
14. As a developer, I want to be able to ask the policy about any day, so that
    testing the window does not mean waiting fourteen days or mocking a global.
15. As a developer adding a fifth condition, I want to add it in one file, and
    have both callers honour it without being edited.

## Implementation Decisions

**One module, `refund-policy`.** It holds the four conditions and nothing else.
Its interface is one function: facts in, decision out. Both the course page
loader and the refund action call it.

**The policy takes facts, not a database.** The caller runs the queries — they
are already written, in both places — and passes plain values. The policy
neither reads nor writes. That is what makes it callable from a test, and it is
the difference between this module and the loader it came out of.

**The decision is a discriminated union.** Eligible carries the amount, the last
day of the window and the days left. Refused carries which condition refused it
and what to tell the Learner. A caller cannot read the amount off a refusal.

**The order of the conditions is the policy's, not the caller's.** Which
refusal the Learner is shown is a decision, so it is made once, inside the
module, in the order the course page already checks them. A Refund already on
the Purchase is reported first; it is not one of the four, and it is the one a
Learner is most likely to have hit.

**HTTP statuses stay in the route.** The policy says which condition refused;
the action maps that to 403 or 409. A domain module that knows about status
codes is a domain module with a second job.

**Two answers are asked for, not written again.** Whether an earlier Refund
blocks a new one is `refundBlocker`, and how much comes back is
`refundableAmount`, both in `app/lib/refunds.ts`. Both routes already share
them, and the policy asks them rather than keeping a copy.

**Time comes in through a `Clock`.** A new `clock` module defines the seam — one
method, "what day is it", answering with a `YYYY-MM-DD` — and the adapter that
reads the machine. Nothing in the policy calls `new Date()`. `clock` also
owns the day arithmetic, which `refund-window` moves onto, so there is one
place in the codebase that knows how to add fourteen days.

**Whole calendar days.** Unchanged: the server's own calendar day, moved on
with `setDate`, as both routes count it today. Comparing `YYYY-MM-DD` strings
is the comparison.

**A Course with no Lessons is not half finished.** Zero of zero is zero.

## Testing Decisions

A good test here calls `decideRefund` and asserts on the decision. It does not
reach into `lib/`, and it does not know how many queries the caller ran. The
module's interface is its test surface: if a test needs something the interface
does not offer, the interface is wrong.

**Modules under test:** `refund-policy` — every condition at its boundary
(allowed one short, refused at exactly the limit), the order refusals are
reported in, the amount, and the whole-day counting at 23:00.
`clock` — the day arithmetic, across a month end and a leap day.

**What is not tested:** the two routes. A loader still needs a `Request`, a
router context and a database, and this spec does not change that. What it
changes is how much of the answer is behind that wall.

**Prior art:** `app/modules/refund-window/tests/refund-window.test.ts`, the
first test of a rule extracted from a loader, and `app/lib/ppp.test.ts` for the
table-driven style.

## Out of Scope

- The other candidates in the report.
- The notification and Ably code in the refund action. Untouched.
- Any change to what an eligible Learner is offered.
- Any schema change. The policy reads columns that already exist.

## Further Notes

The behaviour change is one-way for a Learner who has finished more than half a
Course: they could raise a Refund by posting the form, and now they cannot. The
course page has refused them all along, so no Learner loses something they were
being offered.

## Tickets

From `/to-tickets`. Each is a vertical slice; the numbers in **Blocked by** are
tickets in this list.

**1 — A `clock` module, and a seam for today**
_Blocked by: nothing._
The `Clock` type, the system adapter, and the calendar-day arithmetic, with
tests.
Prefactoring: nothing calls it yet, and nothing is deleted.

**2 — `refund-window` takes a clock**
_Blocked by: 1._
Moves the day arithmetic out of `refund-window/lib/` and onto `clock`, and
changes `summariseRefundExposure` to take a `Clock`. The analytics loader passes
the system clock. Existing tests move to a fixed clock and keep passing.

**3 — The refund policy, as a module with tests**
_Blocked by: 1, 2._
`refund-policy`, its four conditions, and the test that proves each boundary.
Nothing calls it yet, so this slice is green on its own.

**4 — The refund action asks the policy**
_Blocked by: 3._
The action gathers the facts and maps a refusal to a status. Deletes its copy of
the window arithmetic and its three inline conditions. This is the slice that
closes the bug.

**5 — The course page asks the policy**
_Blocked by: 3._
`getRefundOffer` gathers the same facts and turns a refusal into a hidden
button. Deletes `asDayString` and the three refund constants above it.

**6 — Delete what is now unreachable**
_Blocked by: 4, 5._
The last copies of `REFUND_WINDOW_DAYS`, the watch limit and the completion
limit outside the modules. `npm run lint:boundaries` and `npm run test` are the
check that nothing reaches past an entry point.
