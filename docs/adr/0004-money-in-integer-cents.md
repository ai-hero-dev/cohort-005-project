# Money is stored as integer cents

Every money column — `courses.price`, `purchases.amount_paid`,
`refunds.amount_refunded` — is an integer count of cents. Floats were rejected:
a Regional Price is a percentage off a list price, and rounding a float twice
puts a cent of drift between what a Learner was charged and what a Refund gives
back. `formatPrice` is the only place that divides by 100.
