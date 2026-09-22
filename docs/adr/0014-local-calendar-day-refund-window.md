# Compare the refund window in local calendar days

The fourteen-day refund window is counted in whole days, not hours, so somebody
who buys at 23:00 still gets the whole of their fourteenth day. We compare
`YYYY-MM-DD` strings built from the server's local clock with
`getFullYear`/`getMonth`/`getDate`, because that is the day the Learner and the
support agent both see on their own calendars.

A UTC comparison was considered and rejected: it would refuse a Learner in
Auckland on what is still, to them, day fourteen.
