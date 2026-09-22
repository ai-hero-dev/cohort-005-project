# Loaders and actions return errors, they do not throw

A loader that cannot continue returns `{ error: "..." }` and the component
renders it. Throwing a `data()` response hands control to an ErrorBoundary,
which loses the rest of the page — a missing rating should not blank the course.

The cost is that every component has a second path to handle. We accepted it.
