# Coding standards

**A `CODING_STANDARDS.md` applies to the directory it sits in, and everything
under it.** This file is the root, so the six rules below apply everywhere.
A rule that is only true in one area lives in that area's file:

| File                             | Applies to                                |
| -------------------------------- | ----------------------------------------- |
| `app/db/CODING_STANDARDS.md`     | The schema, migrations and every query     |
| `app/routes/CODING_STANDARDS.md` | Loaders, actions and anything they reach   |
| `app/components/CODING_STANDARDS.md` | React components and what they render  |

Read the root file and the one for the directory you are editing. Nothing
else.

## Fail with a thrown response, not a return value

A loader or an action that cannot continue throws. It does not return an
error shape for the component to unpack.

```ts
if (!course) throw data("Course not found", { status: 404 });
```

The route then has one success path. A returned error shape gives every
component a second path to forget about.

## Parse untrusted input with a schema

Form data, search parameters and request bodies get a zod schema before the
values reach any query. Do not read `formData.get("x") as string`. The cast
is a lie the type checker believes.

## Do not write `any`, and do not write `!`

Both switch the type checker off at the exact point you are least sure. If a
value can be missing, narrow it with a check. If you cannot name the type,
the shape is wrong — fix the shape.

## A comment says why, and it says it about the code that is there

Three comments earn their place: why a decision was taken, what a caller must
know that the signature does not say, and a warning about something
surprising. Nothing else.

Two habits are banned, because the review that wrote this rule found both
across one diff:

**A comment that describes code that is no longer there.** It is worse than no
comment, because it is believed.

```ts
// Reads the learner's cached progress row for a lesson, falling back to the
// progress service when the cache has not been warmed yet.
function getLessonProgress(userId: number, lessonId: number) {
  return db.select().from(lessonProgress)/* … */.get();
}
```

There is no cache and there is no progress service. The comment is describing
a shape the code had before it was inlined.

**A comment that restates the line under it, or contradicts it.**

```ts
if (existing) {
  // Create the note row.
  return db
    .update(notes)
    .set({ body, updatedAt: now })
    .where(eq(notes.id, existing.id))
    .returning()
    .get();
}
```

If you are writing a comment, read the line beneath it first. If the comment
says the same thing, delete the comment. If it says a different thing, one of
the two is wrong — find out which before you commit.

When you change a line, read the comment above it in the same breath. A
comment is part of the line, not decoration near it.

## Keep files under 500 lines

Keep every file under 500 lines.

## Import a module through its entry points, never into its subfolders

Every directory under `app/modules/` is a deep module. Its **entry points**
are its root files, and they are its whole public surface. Everything in a
subfolder — `lib/`, `tests/`, anything else you add — is implementation, and is
private.

```ts
import { summariseRefundExposure } from "~/modules/refund-window"; // yes
import { dayOfMoment } from "~/modules/clock/lib/calendar-days"; // no
```

A module whose interface hides its implementation only hides it while nobody
is allowed to reach past it. Give one caller a deep import and the
implementation is now the interface, and you find that out the day you try to
change it.

Three things follow, and they are the ones people get wrong:

- **A module's own tests go through the entry points too.** A test that imports
  `lib/` is a test of the implementation, and it fails the next time the
  implementation is correctly rewritten.
- **Do not write a barrel.** An `index.ts` that re-exports the whole subtree has
  an interface as wide as its implementation. Expose several small entry points
  instead.
- **Two modules that import each other are one module.** Cycles are an error.

`npm run lint:boundaries` enforces all of this with dependency-cruiser. The
rules are errors, not warnings. See
[app/modules/README.md](./app/modules/README.md).

## What was taken out, and why

This file had grown to ninety-four rules. Most of them went, in two piles.

**A linter already does it.** Indentation, quote style, semicolons, trailing
commas, trailing whitespace, the final newline, line width, import order. A
rule a machine enforces does not need a human to remember it. If one of these
starts slipping, add it to the formatter, not here.

**Nobody was ever going to be told it twice.** `const` over `let`, `===` over
`==`, arrow callbacks, not abbreviating a variable name, naming a boolean
`isThing`, not committing commented-out code, not leaving a `console.log`,
writing types the compiler can already infer. These restate the language, or
they restate taste. A standard is a thing a review found, wrote down, and
never had to say again — not a style guide.

Process rules went too: branch names, squashing, what a pull request may
contain. True, and not about the code in front of you.
