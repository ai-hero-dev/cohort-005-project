# Coding standards

These rules carry over from the AI Coding Crash Course. They are short on
purpose. Add a rule when a review or a retro shows you need one — not before.

**A `CODING_STANDARDS.md` applies to the directory it sits in, and everything
under it.** This file is the root, so the four rules below apply everywhere.
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
