# SQLite as the database

Cadence runs as a single Node process with one writer, and the whole dataset is
small enough to sit on one disk. We picked SQLite over Postgres because it
removes a service to run, back up and connect to, and `better-sqlite3` gives us
synchronous reads inside loaders with no connection pool to reason about.

We accept that this pins us to one machine. Moving off it later means a real
migration, which is why it is written down.
