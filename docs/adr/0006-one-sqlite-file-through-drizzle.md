# Keep all data in one SQLite file, reached through Drizzle

Cadence runs as one server process, so its data lives in a single SQLite file (`data.db`), opened with `better-sqlite3` and queried through Drizzle ORM. SQLite needs no database server to run, back up or pay for, and `better-sqlite3` is synchronous, so a loader reads its data without a round trip. We picked Drizzle over Prisma because its queries read like the SQL they run, its schema is plain TypeScript in `app/db/schema.ts`, and it needs no separate query engine binary.

## Considered Options

- **Postgres.** Rejected for now: a second service to run, for load we do not have.
- **Prisma.** Rejected: a generated client and an engine binary, and queries that hide the SQL.

## Consequences

There is one writer at a time, and the app cannot run on more than one machine against the same data. Moving to a networked database later means a data migration, a new driver, and making every synchronous query async.
