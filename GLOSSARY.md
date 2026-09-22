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
inside the fourteen-day window, under half the course completed, under two
hours watched, no Seat claimed from it, and the amount given back is the
amount actually paid. All five, or no Refund.
_Avoid_: Refund rules, eligibility

**Enrollment**:
A learner's standing access to a course. It starts when they buy or claim a
Seat, and it is what the course pages check before showing content.
_Avoid_: Membership, subscription

**Seat**:
One learner's place on a course, bought by a team and handed out with a code.
A Seat is claimed once, by one learner, and cannot be handed back by them.
_Avoid_: Licence, invite, coupon
