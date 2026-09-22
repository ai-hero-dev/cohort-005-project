---
status: deprecated
---

> **Deprecated.** The code no longer does this. `resolveCountry` in
> `app/lib/country.server.ts` geolocates: a dev session override first, then
> the `CF-IPCountry` header, then an `ip-api.com` lookup on the forwarded IP.
> The country select was dropped because almost nobody changed it from the
> default. What survives of this decision is the Regional Price entry in
> `GLOSSARY.md`: a Learner is still held to the country their Purchase was
> made from.

# Do not geolocate for Regional Price

A Learner's country is whatever they tell us it is at purchase time, taken from
a select on the purchase page and written to `purchases.country`. We deliberately
do not look at IP addresses: geolocation is wrong often enough that a VPN or a
corporate proxy would silently charge somebody the wrong price, and we would
have no record of why.

The trade-off we accepted is that the select is trivially gameable. Holding the
Learner to the country they bought from, for the life of the Enrollment, is what
makes that acceptable.
