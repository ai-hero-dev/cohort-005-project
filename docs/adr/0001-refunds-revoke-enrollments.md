# Refunds revoke Enrollments; buying again creates a new one

When an Admin approves a Refund, the Learner's Enrollment is marked as revoked rather than deleted, so the lesson progress made under it survives as a record. If the Learner buys the Course again they get a new Enrollment and start fresh; the Revoked Enrollment is never reactivated. A Learner can therefore have several Enrollments on one Course, but at most one that is not revoked — and every "is this Learner enrolled?" check must look only at that one.

## Considered Options

- **Delete the Enrollment on Refund.** Simplest, and keeps one-Enrollment-per-Course, but progress rows reference their Enrollment, so the record would be lost.
- **Reactivate the same Enrollment on re-purchase.** Keeps one row, but carries old progress into a new Purchase. Rejected: a re-purchase should start fresh.
