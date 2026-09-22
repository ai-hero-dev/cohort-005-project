# Modules

Every directory in here is a **deep module**: a lot of behaviour behind a small
interface. This is where a rule goes when it has a name of its own and you want
to be able to call it — from another module, or from a test.

## The shape

```
app/modules/
  refund-window/
    index.ts        ← an entry point. Import this from outside.
    lib/            ← implementation. Private.
    tests/          ← tests and fixtures. Private.
```

A module's **entry points are its root files** — not one designated `index.ts`.
A module may expose several (`index.ts`, `client.ts`, `server.ts`) rather than
funnelling everything through one file. Adding an entry point is adding a root
file.

**Do not write barrel files.** An `index.ts` that re-exports a whole subtree
has an interface exactly as wide as its implementation, which is the definition
of a shallow module. `refund-window/index.ts` is an entry point because it
holds the contract and hands the day arithmetic to the `clock` module; it
is not a list of re-exports.

Copy `refund-window/` when you start a new one. It is the template.

## The four rules

`npm run lint:boundaries` runs dependency-cruiser over `app/` with the rules in
`.dependency-cruiser.cjs`. All four are errors, and `AGENTS.md` lists the
command with `typecheck` and `test` as a check to run before a change is
complete.

It cruises `app`, not `app/modules`, because two of the four rules are about
who is doing the importing. A route reaching into a module's `lib/` folder is
only visible if the route is cruised too.

**Entry-point boundary.** Code outside a module — a route, a component, another
module — may import that module's entry points and nothing in its subfolders.
`~/modules/refund-window` is allowed;
`~/modules/clock/lib/calendar-days` is not.

**Intra-module freedom.** A module's own files import each other freely. The
boundary is around the module, not inside it.

**Tests through the entry points.** A module's tests call it the way everybody
else does: through its entry points. A test may import any module's entry
points and its own `tests/` fixtures, and never any `lib/` folder — not even
its own. A test that reaches past the interface is testing the implementation,
and it will fail the next time the implementation is right.

**No cycles.** Two modules that need each other are one module.

## Why the boundary is worth having

The interface is the test surface. If a caller can reach any function in the
module, then every function in the module is public, and changing one of them
is a change to the whole codebase's contract. Hiding the implementation is what
lets you rewrite it.
