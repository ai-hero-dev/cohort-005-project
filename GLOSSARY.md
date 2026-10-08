# Cadence

An online course platform where learners buy and watch video courses.

## Language

**Learner**:
A person who buys and takes courses.
_Avoid_: Student, customer, user

**Course**:
A set of lessons sold as one item.

**Enrollment**:
A Learner's place on one Course, which lets them watch it. Their progress through the lessons belongs to the Enrollment it was made under.
_Avoid_: Registration, Subscription

**Revoked Enrollment**:
An Enrollment whose access has been taken away because its Purchase was refunded. Its progress is kept as a record, but it is never restored: a Learner who buys the Course again gets a new Enrollment and starts fresh.
_Avoid_: Ended, Cancelled, Deleted, Unenrolled

**Purchase**:
A Learner's payment for one Course, recorded with the amount they actually paid.
_Avoid_: Order, transaction

**Refund**:
A Learner's request to get their money back for a Purchase, together with its outcome. A Refund is requested, then approved or declined by an Admin. The outcome is final; an approved Refund gives back exactly what the Learner paid, never part of it.
_Avoid_: Cancellation, Reversal, Chargeback, Refund Request, Pending

**Admin**:
A Cadence staff member who runs the platform, and the only person who approves or declines a Refund.
_Avoid_: Team admin (a Learner who manages a team's seats is not an Admin)

**Watch Limit**:
A Refund is only offered on a course with under two hours watched. Past that, the Learner has had the course, and the refund form turns them away.
_Avoid_: Watch cap, Viewing threshold

**Refunds table**:
`refunds` — one row per Refund. Columns: `id`, `purchase_id`, `status` (`requested`, `approved`, `declined`), `reason`, `amount_refunded`, `requested_at`, `resolved_at`, `resolved_by_user_id`.

**revoked_at**:
Nullable text column on `enrollments`. An ISO timestamp, set when an approved Refund takes the course away. Access checks filter on `isNull(enrollments.revokedAt)`.

**resolved_by_user_id**:
Integer column on `refunds`, referencing `users.id`. Null until an Admin approves or declines the Refund.

**RefundRow**:
The component that draws one requested Refund on `/admin/refunds`, with its Approve and Decline buttons.

**Button**:
A clickable element that fires an action when the user presses it. Built on `~/components/ui/button`.

**Component**:
A React function that returns JSX.

**cwd**:
The directory the dev server was started from. Paths in `scripts/` resolve from here.

**Loader**:
The React Router function that fetches a route's data on the server before the page renders.

**Slug**:
The URL-safe name of a course, as in `/courses/:slug`.
