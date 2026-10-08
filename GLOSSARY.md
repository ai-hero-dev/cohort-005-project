# Cadence

Cadence sells video courses to learners. This glossary covers the language around buying courses and getting money back after a purchase.

## Language

### People

**Platform Admin**:
A member of Cadence staff who runs the platform. Only a Platform Admin decides Refund Requests.
_Avoid_: Admin (on its own), the team, Staff

**Team Admin**:
A learner who buys and manages a Team Licence. A Team Admin has no say over Refund Requests.
_Avoid_: Admin (on its own)

### Purchases

**Purchase**:
A single payment for a course. It is either an Individual Purchase or a Team Licence.
_Avoid_: Order, Transaction

**Individual Purchase**:
A Purchase a learner makes for themselves. It gives the buyer the course.

**Team Licence**:
A Purchase a Team Admin makes for others. It grants Seats, not the course itself; the buyer can't watch the course through it.
_Avoid_: Team purchase, Bulk purchase

**Seat**:
One place on a Team Licence that a learner can claim to get the course.
_Avoid_: Coupon, Code, Voucher

**Unclaimed Seat**:
A Seat no learner has claimed yet.

**Claimed Seat**:
A Seat a learner has claimed. It belongs to that learner, so a Team Licence with any Claimed Seat can't be refunded.

### Refunds

**Refund Request**:
The buyer's ask, with their reason, to get back what they paid for one specific Purchase. A Platform Admin approves or declines it. One Purchase can have several Refund Requests over time, but only one can be undecided at once.
_Avoid_: Refund (for the ask itself), Cancellation, Reversal, Chargeback

**Open Refund Request**:
A Refund Request no Platform Admin has decided yet. The buyer keeps the course while it is open, and a Team Licence's Unclaimed Seats can't be claimed.
_Avoid_: Pending, Requested, Awaiting review

**Approved Refund Request**:
A Refund Request a Platform Admin has accepted. Approving it ends what the Purchase granted (the buyer's place on the course for an Individual Purchase; its Unclaimed Seats, which can then never be claimed, for a Team Licence) and leads to a Refund.

**Declined Refund Request**:
A Refund Request a Platform Admin has turned down. Nothing the Purchase granted is lost, it has no Refund, and the buyer may raise a new Refund Request.

**Refund**:
The money returned to the buyer after their Refund Request is approved. It is always the full amount they paid. A declined Refund Request has no Refund.
_Avoid_: Reversal, Chargeback, Cancellation

**Pending Refund**:
A Refund whose Refund Request has been approved, where the money hasn't been confirmed as sent yet.
_Avoid_: Pending (for a Refund Request awaiting review)

**Issued Refund**:
A Refund where the money has been confirmed as sent back to the buyer.
_Avoid_: Completed, Paid out

**Failed Refund**:
A Refund where the money couldn't be sent. The Refund Request stays approved, because the decision hasn't changed.

### Other terms

**Watch Limit**:
A Refund is only offered on a course with under two hours watched. Past that, the Learner has had the course, and the refund form turns them away.
_Avoid_: Watch cap, Viewing threshold

**Refunds table**:
`refunds` — one row per Refund. Columns: `id`, `purchase_id`, `status` (`open`, `approved`, `declined`), `reason`, `amount_refunded`, `requested_at`, `resolved_at`, `resolved_by_user_id`, `decision_note`.

**refunded_at**:
Nullable text column on `coupons`. An ISO timestamp, set on every unclaimed coupon when its team purchase is refunded. `getSeatAvailability` returns `"refunded"` for it.

**resolved_by_user_id**:
Integer column on `refunds`, referencing `users.id`. Null until an Admin approves or declines the Refund.

**RefundRequestCard**:
The component that draws one Refund Request on `/admin/refunds`, with its Approve and Decline buttons.

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
