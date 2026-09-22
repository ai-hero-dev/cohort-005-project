---
status: deprecated
---

> **Deprecated.** The code no longer does this. `app/lib/access.server.ts`
> holds `getAccess` and the `requireUserId` / `requireContentAccess` /
> `requireStaff` wrappers, and routes call them. The inline checks drifted:
> the same "is this person staff for this course" question was answered four
> different ways, and two of them were wrong for admins.

# Each route does its own access check, inline

There is no shared access helper. Every loader and action that needs to know
who the caller is reads the session, loads the user, and checks the role
itself, at the top of the function.

A shared `requireX` module was considered and rejected: it hides the check one
import away from the route that depends on it, and it grows a parameter for
every new rule until nobody can tell what a given call actually enforces. A
reviewer should be able to see a route's whole authorisation story without
leaving the file.
