# Coding standards: the database

Applies to `app/db/`, `drizzle/`, and every query, wherever it is written —
which, in this codebase, is inside the route modules. The root
`CODING_STANDARDS.md` applies here too.

## Select the columns you need, never all of them

`select *` reads pages you do not want, and it ties the caller to the shape of
the table. Name the columns in the `.select({ … })`.

## Index every foreign key you filter or join on

A foreign key without an index is a table scan on every join. Add the index in
the same migration that adds the key.

## Avoid the N+1

One query inside a loop is N+1 queries. Use a join, or one query with an
`inArray`. This bites hardest on a list page, where the loop is over rows the
page already fetched.

## Wrap related writes in a transaction

Two writes that must both land, or neither, go in a transaction. If the second
fails and the first stayed, you have invented a state nothing knows how to
read.

## Paginate anything that can grow

A query with no limit is fine on a seeded database and fatal on a real one. If
the row count is a function of how long the product has been alive, add a
limit.

## Migrations are forward-only

Never edit a migration that has been applied. Write another one. Never
hand-write the SQL either — change `app/db/schema.ts` and run
`npm run db:generate`.

## Timestamps are ISO strings, in UTC

A local time in a column is a bug waiting for somebody in another country.

## Money is integer cents

Never a float. See `docs/adr/0004-money-in-integer-cents.md`.

## Soft-delete anything a person can point at

If another row references it, or a person holds a link to it, do not delete
it. Mark it deleted and filter it out on read. See
`docs/adr/0001-soft-delete-enrollment-on-refund.md`.

## A status lives as an enum in the schema file

A status string the code compares against is a TypeScript enum in
`app/db/schema.ts`, not a literal repeated in six places.
