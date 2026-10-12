# Record the buyer's country on the purchase, at the moment of sale

A purchasing-power price is only fair in the country it was given for. So every purchase stores the country it was made from (`purchases.country`), and later checks read it from there: a discounted purchase only plays in that country (the Country Lock, `checkCountryLock` in `app/lib/ppp.ts`), and a refund on it gives back what was paid. We could have resolved the country again on every visit instead, but then a Student's price and access would change as they travel, and nobody could say afterwards what a purchase was sold at.

## Consequences

A purchase made before this column existed has no country, and there is no way to recover it. Platform Admins, and the Instructor who owns the course, are exempt from the country check.
