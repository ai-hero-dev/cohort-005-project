# The development database is disposable

`data.db` is gitignored and holds nothing but seed data, so a schema change is
free: generate the migration, delete the file, reseed. This is why
`scripts/seed.ts` is part of every schema change rather than a follow-up — the
seed script, not the database file, is the definition of the starting data.
