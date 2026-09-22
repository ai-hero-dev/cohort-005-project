---
status: deprecated
---

> **Deprecated.** The code no longer does this. `CODING_STANDARDS.md` now says
> a loader or action that cannot continue throws — `throw data("Course not
> found", { status: 404 })` — so a route has one success path. The returned
> error shape gave every component a second path to forget about, and
> components forgot.

# Loaders and actions return errors, they do not throw

A loader that cannot continue returns `{ error: "..." }` and the component
renders it. Throwing a `data()` response hands control to an ErrorBoundary,
which loses the rest of the page — a missing rating should not blank the course.

The cost is that every component has a second path to handle. We accepted it.
