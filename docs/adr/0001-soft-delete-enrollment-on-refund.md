---
status: accepted
---

# Soft-delete the Enrollment when a Refund is approved

Approving a Refund has to take the course away, but a learner's Enrollment is
the anchor for their lesson progress, quiz attempts, watch events, rating and
comments — all of which point at the learner and the course, not at the
Enrollment row. Deleting the row leaves that history orphaned and makes a
mistaken approval impossible to undo. So an approved Refund stamps
`enrollments.refunded_at` and leaves the row where it is.

## Considered options

- **Hard-delete the Enrollment.** Rejected: it throws away the only record
  that the learner was ever on the course, and a wrongly approved Refund can
  then only be repaired by re-enrolling from scratch, which loses their
  progress. Deleting the dependent rows as well would destroy the instructor's
  analytics history for a course they were paid for at the time.
- **Move the row to an `ended_enrollments` table.** Rejected: it doubles every
  read of enrollment history and buys nothing a nullable timestamp does not.

## Consequences

Every read that means "does this learner have access now?" must filter on
`refunded_at` being null. There is no shared enrollment query to change, so
that filter is repeated at each call site and a new one is easy to forget — a
missed filter hands a refunded learner the course back.
