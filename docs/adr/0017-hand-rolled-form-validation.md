---
status: deprecated
---

> **Deprecated.** The code no longer does this. `CODING_STANDARDS.md` now
> requires a zod schema for form data, search parameters and request bodies,
> and `app/lib/validation.ts` provides `parseFormData`, `parseParams` and
> `parseJsonBody`. The `as string` casts this ADR argued for were the lie that
> the standard was written to stop.

# Validate form input by hand, not with a schema library

Form fields arrive as strings. Reading them with `formData.get("x") as string`
and checking them with a few `if` statements keeps the validation next to the
thing it protects and keeps a dependency out of the bundle.

Zod was considered. It was rejected as too much ceremony for four fields, and
because a schema parsed at the top of an action moves the error messages away
from the branch that cares about them.
