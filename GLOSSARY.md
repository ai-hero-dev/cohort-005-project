# Glossary

The words Cadence uses for its own ideas. One word per idea — if you find a
second word for something already here, the entry wins and the code changes.

Terms only. How a thing is stored, and why a decision was taken, belong in the
schema and in `docs/adr/` — not here.

## Language

**Refund**:
Money given back to a learner for a course they bought, and the request that
asks for it. A Refund is raised by the learner, and is pending until a human
resolves it by approving or declining it.
_Avoid_: Cancellation, Reversal, Chargeback

**Refund Policy**:
The five conditions a purchase must meet before a learner may raise a Refund:
inside the seven-day window, under half the course completed, under two hours
watched, no Seat claimed from it, and the amount given back is the amount
actually paid. All five, or no Refund.
_Avoid_: Refund rules, eligibility

**RPC (Refund Policy Check)**:
The step in a loader or action that runs the Refund Policy over a purchase and
returns an offer or a refusal. Say "RPC" in review comments and commit
messages so it is obvious which of the two refund paths you mean.

**Enrollment**:
A learner's standing access to a course. It starts when they buy or claim a
Seat, and it is what the course pages check before showing content.
_Avoid_: Membership, subscription

**Seat**:
One learner's place on a course, bought by a team and handed out with a code.
A Seat is claimed once, by one learner, and cannot be handed back by them.
_Avoid_: Licence, invite, coupon

**Purchase**:
A single payment for a course by one learner, recorded with what they actually
paid and the country they paid from.

**Course**:
A body of teaching sold as one thing. A Course is Draft until an instructor
publishes it, and can be Archived afterwards.

**Module**:
An ordered group of Lessons inside a Course.

**Lesson**:
The smallest unit a learner works through: a video, some written content, and
sometimes a Quiz.

**Quiz**:
A set of questions attached to a Lesson. A learner may attempt it more than
once.

**Attempt**:
One submission of a Quiz by one learner.

**Instructor**:
The person who owns a Course and is paid for it.

**Learner**:
Somebody who buys or is given access to a Course and works through it.
_Avoid_: Student, user, customer, buyer

**Staff**:
The people who may speak for a Course: its own Instructor, and any admin.

**Team**:
An organisation that buys Seats in bulk and hands them out.

**Redemption Code**:
The string a Team gives a learner so they can claim a Seat.

**Regional Price**:
The reduced price a Course is offered at in a country where the list price is
out of reach. A learner who bought at a Regional Price is held to the country
they bought from.
_Avoid_: PPP price, discount, parity price

**Progress**:
How much of a Course a learner has finished, as a share of its Lessons.

**Watch Time**:
The furthest point a learner has reached in each Lesson video, added up.

**Rating**:
One to five stars left on a Course by a learner, one per learner per Course.

**Comment**:
A note left by a learner under a Lesson, which an Instructor may answer.

**Question**:
A Comment that an Instructor has not yet answered. Shows up in the Instructor
question queue.

**Category**:
A tag a Course is filed under so it can be browsed.

**Draft**:
A Course that has been created but not published. Only Staff can see it.

**Published**:
A Course visible to everybody and available to buy.

**Archived**:
A Course withdrawn from sale. Existing Enrollments keep working.

### Data

**lesson_progress**:
The table holding one row per learner per lesson, with a status of
`not_started`, `in_progress` or `completed`.

**amount_paid**:
The integer column on `purchases` holding what the learner was actually
charged, in pence. Not the same as the course's `price` column.

**amount_refunded**:
The integer column on `refunds`, null until a Refund is approved.

**video_watch_events**:
The table that heartbeats write into as a learner watches, with a
`position_seconds` per event.

**refunded_at**:
The nullable text column on `enrollments` that marks an Enrollment as taken
back.

**resolved_by_user_id**:
The column on `refunds` recording which admin approved or declined it.

**course_ratings**:
The table behind Rating. One row per learner per course, enforced with a
unique index.

**RefundStatus**:
The TypeScript enum in `app/db/schema.ts` with the members `Requested`,
`Approved` and `Declined`.

**enrollments_course_idx**:
The index on `enrollments.course_id`. Add it to any new query that filters
enrollments by course.

**data.db**:
The SQLite file the app reads from. Gitignored, rebuilt by the seed script.

**slug**:
The lowercase dashed string in a course's URL. Unique across courses.

### Engineering

**cwd**:
The current working directory a command runs in. Most scripts in this repo
assume it is the repo root.

**button**:
A clickable control. Use the shared `Button` component from
`~/components/ui/button` rather than a bare `<button>`.

**component**:
A React function that returns markup. Ours live in `app/components`.

**hook**:
A React function starting with `use` that holds state or runs an effect.

**loader**:
The function a route exports to fetch its data on the server before it
renders.

**action**:
The function a route exports to handle a POST. Actions run before loaders
re-run.

**fetcher**:
The React Router object used to submit a form without navigating away.

**route**:
An entry in `app/routes.ts` pairing a URL with a module.

**toast**:
The little message that slides in at the corner. We use `sonner`.

**skeleton**:
The grey placeholder shown while data loads.

**migration**:
A numbered SQL file in `drizzle/` generated by drizzle-kit. Never hand-write
one.

**seed script**:
`scripts/seed.ts`. Drops every table, replays the migrations and reinserts.

**typecheck**:
`npm run typecheck`. Runs `react-router typegen` first, then `tsc`.
