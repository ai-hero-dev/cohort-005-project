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
_Avoid_: Ended, Cancelled, Deleted, Unenrolled, Lapsed

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
The amount of a Course a Learner can have Watched and still get a Refund. Past it, the Learner has had the course, and no Refund is offered.
_Avoid_: Watch cap, Viewing threshold

**Instructor**:
Speaks for their own courses only. An Instructor builds and edits the courses they own, and sees the learners enrolled on them.
_Avoid_: Teacher, Author, Creator

**Watched**:
Seconds of video a Learner has actually played in a course: the furthest point reached in each lesson, added up. Not lessons opened.
_Avoid_: Viewed, Progress

**Bookmark**:
A Learner's flag on a Lesson, so they can find it again. One per Learner per
Lesson, and the Learner is the only one who sees it.
_Avoid_: Favourite, star, saved item

**Note**:
A Learner's own writing about a Lesson, private to the Learner who wrote it.
One per Learner per Lesson. A Note is not a Comment — a Comment is addressed
to other people, a Note is addressed to nobody.
_Avoid_: Annotation, scratchpad, memo
