# Modules

Every directory in here is a **deep module**: a lot of behaviour behind a small
interface. This is where code goes once it has a name of its own and you want
to keep it that way — callable from a route, another module or a test, and
reachable only through the front door.

## The shape

```
app/modules/
  instructor-analytics/
    index.ts        ← the entry point. Import this from outside.
    lib/            ← implementation. Private.
    tests/          ← tests and fixtures. Private.
```

`instructor-analytics` is the first one. It started as a 1,000-line loader,
became one function with an interface — `getInstructorAnalytics(db, viewer,
params, now)` — and moved in here so it stays that way. Its `index.ts` holds
that function and the types a caller reads off its result. The queries behind
each panel live in `lib/`, and nobody outside the module knows they exist.

A module's **entry points are its root files** — not one designated `index.ts`.
A module may expose several (`index.ts`, `client.ts`, `server.ts`) rather than
funnelling everything through one file. Adding an entry point is adding a root
file, and it is a decision: everything in it is now part of the contract.

**Do not write barrel files.** An `index.ts` that re-exports a whole subtree
has an interface exactly as wide as its implementation, which is the definition
of a shallow module. `instructor-analytics/index.ts` re-exports the types of
its result and nothing else; `getTopBuyers` and `summariseRefundExposure` are
exported from `lib/` only so the module's own files can share them.

Copy `instructor-analytics/` when you start a new one. It is the template.

## What goes wrong without a boundary

A module goes shallow from the outside. Nobody rewrites it; somebody needs one
figure the page does not show yet, imports `lib/overview.ts` straight into the
route, and now `getTopBuyers`' signature is a contract with a route. Or they
skip the module altogether, write a query next to the call in the loader, and
the logic the module was made to hold starts growing back where it came from.
Either way the interface stops being the interface, and the tests that go
through it stop covering what the page does.

## The rules

`npm run lint:boundaries` runs dependency-cruiser over `app/` with the rules in
`.dependency-cruiser.cjs`. They are all errors, and `AGENTS.md` lists the
command with `typecheck` and `test` as a check to run before a change is
complete.

It cruises `app`, not `app/modules`, because most of the rules are about who
is doing the importing. A route reaching into a module's `lib/` folder is only
visible if the route is cruised too.

**Entry-point boundary.** Code outside a module — a route, a component, another
module — may import that module's entry points and nothing in its subfolders.
`~/modules/instructor-analytics` is allowed;
`~/modules/instructor-analytics/lib/overview` is not.

**Intra-module freedom.** A module's own files import each other freely. The
boundary is around the module, not inside it.

**Tests through the entry points.** A module's tests call it the way everybody
else does: through its entry points. A test may import any module's entry
points and its own `tests/` fixtures, and never any `lib/` folder — not even
its own. A test that reaches past the interface is testing the implementation,
and it will fail the next time the implementation is right.

**No cycles.** Two modules that need each other are one module.

**The analytics route asks the module.** `app/routes/instructor.analytics.tsx`
may not import `~/db/schema` or `drizzle-orm`. It hands the module the
connection, the viewer, the search params and the time, and renders what comes
back. A new figure on that page is a change to `instructor-analytics`, where
its tests already are.

## Why the boundary is worth having

The interface is the test surface. If a caller can reach any function in the
module, then every function in the module is public, and changing one of them
is a change to the whole codebase's contract. Hiding the implementation is what
lets you rewrite it.
