# The refund window owns its own day arithmetic

There was a `clock` module: a `Clock` interface with one method, a `systemClock`
adapter, and the UTC day arithmetic behind it. `refund-window` and
`refund-policy` both took a `Clock` and handed it around. It has been merged
into `app/services/refund-window/`, `addDays` and `daysBetween` are private
there, and the public functions take a `Date`.

Four things decided it, and the first two are the ones worth remembering:

- **One adapter, and one caller.** `systemClock` was the only implementation
  that ever existed, and `refund-window` was the only module that ever called
  a `Clock` method — `refund-policy` only took one so it could pass it on. An
  interface with one implementation is not a seam. It is a hypothetical seam,
  and you find out whether it was a real one the day a second adapter turns up.
- **The seam it bought was already there.** The thing a test needs is to name
  the moment, and `now: Date` names it. The interface added a type, an object
  and a method call per caller, and bought nothing a parameter did not.
- **Neither half read on its own.** "Is this Purchase still refundable" was
  fourteen days in one file and what a day is in another. Answering it meant
  both open.
- **The name was aspirational.** `clock` and `calendarDay` are generic, and
  there is exactly one thing in this codebase that counts days: the refund
  window. A generic name on a module with one caller is a guess about a future
  that had not happened.

The merged module's interface is _smaller_ than the two it replaced — nine
exported names against fourteen — and its implementation is bigger. That is the
direction to move a module in, and it is the reason splitting is not
automatically an improvement. A module can be too small.

`docs/specs/refund-policy.md` records the Clock seam as a decision of its own.
It was the right call to make the Policy take its time from outside; it was the
wrong call to make that an interface and a module.
