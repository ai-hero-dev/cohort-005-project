# Glossary

The words Cadence uses for its own ideas. One word per idea — if you find a
second word for something already here, the entry wins and the code changes.

Two rules decide what belongs:

- **It is a word about the business, not about the machine.** `cwd`, `hook`,
  `loader` and `toast` mean the same thing in any codebase, so they are not
  Cadence's language and they are not here.
- **It is a concept, not a place the concept is stored.** Table and column
  names (`lesson_progress`, `amount_paid`, `refunded_at`) belong to the schema.
  Read them there; they change without the idea changing.

Why a decision was taken belongs in `docs/adr/`, not here.

## Refunds

**Refund**:
Money given back to a learner for a course they bought, and the request that
asks for it. A Refund is raised by the learner, and is pending until Staff
resolve it by approving or declining it.
_Avoid_: Cancellation, Reversal, Chargeback

**Refund Policy**:
The five conditions a purchase must meet before a learner may raise a Refund:
inside the fourteen-day window, under half the course completed, under two
hours watched, no Seat claimed from it, and the amount given back is the
amount actually paid. All five, or no Refund.
_Avoid_: Refund rules, eligibility, RPC

## People

**Learner**:
Somebody who buys or is given access to a Course and works through it.
_Avoid_: Student, user, customer, buyer

**Instructor**:
The person who owns a Course and is paid for it.

**Staff**:
The people who may speak for a Course: its own Instructor, and any admin.

**Team**:
An organisation that buys Seats in bulk and hands them out.

## Catalogue

**Course**:
A body of teaching sold as one thing. A Course is Draft until an Instructor
publishes it, Published while it is on sale, and Archived once it is
withdrawn — Archiving leaves existing Enrollments working.

**Module**:
An ordered group of Lessons inside a Course.

**Lesson**:
The smallest unit a Learner works through: a video, some written content, and
sometimes a Quiz.

**Quiz**:
A set of questions attached to a Lesson. A Learner may attempt it more than
once, and each submission is an Attempt.

**Category**:
A subject a Course is filed under so it can be browsed.

## Access

**Enrollment**:
A Learner's standing access to a Course. It starts when they buy or claim a
Seat, and it is what the Course pages check before showing content. An
approved Refund ends it without erasing it.
_Avoid_: Membership, subscription

**Seat**:
One Learner's place on a Course, bought by a Team and handed out with a
Redemption Code. A Seat is claimed once, by one Learner, and cannot be handed
back by them.
_Avoid_: Licence, invite, coupon

**Redemption Code**:
The string a Team gives a Learner so they can claim a Seat.

## Money

**Purchase**:
A single payment for a Course by one Learner, recorded with what they actually
paid and the country they paid from.

**Regional Price**:
The reduced price a Course is offered at in a country where the list price is
out of reach. A Learner who bought at a Regional Price is held to the country
they bought from, and a Refund gives back that price, not the list price.
_Avoid_: PPP price, discount, parity price

## Learning

**Progress**:
How much of a Course a Learner has finished, as a share of its Lessons.

**Watch Time**:
The furthest point a Learner has reached in each Lesson video, added up.

**Rating**:
One to five stars left on a Course by a Learner, one per Learner per Course.

**Comment**:
A note left by a Learner under a Lesson. A Comment an Instructor has not yet
answered is a Question, and waits in the Instructor's question queue.
