# Drizzle, not Prisma

We use Drizzle as the query builder. Prisma was the obvious choice and we
rejected it: it needs a generate step in the build, it ships its own query
engine binary, and its client hides the SQL that SQLite's query planner is
sensitive to. Drizzle's schema is plain TypeScript, so `app/db/schema.ts` is
both the migration source and the type source.
