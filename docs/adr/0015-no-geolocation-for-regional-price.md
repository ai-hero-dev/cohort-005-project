# Do not geolocate for Regional Price

A Learner's country is whatever they tell us it is at purchase time, taken from
a select on the purchase page and written to `purchases.country`. We deliberately
do not look at IP addresses: geolocation is wrong often enough that a VPN or a
corporate proxy would silently charge somebody the wrong price, and we would
have no record of why.

The trade-off we accepted is that the select is trivially gameable. Holding the
Learner to the country they bought from, for the life of the Enrollment, is what
makes that acceptable.
