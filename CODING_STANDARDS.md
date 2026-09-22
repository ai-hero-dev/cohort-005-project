# Coding standards

**A `CODING_STANDARDS.md` applies to the directory it sits in, and everything
under it.** This file is the root, so the six rules below apply everywhere.
A rule that is only true in one area lives in that area's file:

| File                                 | Applies to                               |
| ------------------------------------ | ---------------------------------------- |
| `app/db/CODING_STANDARDS.md`         | The schema, migrations and every query   |
| `app/routes/CODING_STANDARDS.md`     | Loaders, actions and anything they reach |
| `app/components/CODING_STANDARDS.md` | React components and what they render    |

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

## Keep a file under five hundred lines

A file you cannot hold in your head is a file nobody reads before they change
it. Five hundred lines is the ceiling. It is not a precise number — it is the
point past which a route module stops being one thing and becomes a pile of
things that happen to share a file.

`app/routes/instructor.analytics.tsx` is about nineteen hundred lines. Every
query, every aggregation and every chart for the whole instructor dashboard
sits in one loader. Nobody chose that. It arrived one addition at a time, and
no step was the step that made it too long.

When a file goes past the ceiling, split it. Move the part that has its own
name into its own module.

`.husky/pre-commit` enforces this rule. `scripts/check-file-size.sh` counts
the bytes of every staged file, divides by four for a token count, and blocks
the commit over 5,500 tokens — about five hundred lines. The sentence above
is no longer something you have to remember.

## Judge a module by what its interface hides

A **module** is a piece of code with two halves: an **interface**, the part a
caller has to know, and an **implementation**, the part it does not. Its
**depth** is the second half divided by the first. A deep module hides a lot
behind a little. A shallow one makes you learn nearly the whole implementation
before you can call it.

Depth is not about size. `JSON.parse` is one function over a whole parser, and
it is the deepest module most of us use every day.

Two questions decide whether a module has earned its place:

**The deletion test.** If you inlined this module back into its callers, would
the complexity concentrate somewhere, or would it just move? "It concentrates"
means the module was doing real work. "It just moves" means the module is a
name in front of a line, and the name is the only thing it adds.

**The interface is the test surface.** You can only test what you can call. A
function you cannot call without building a `Request`, a router context and a
matched route is not tested today and is not going to be.

Name the module after the idea, in the words `GLOSSARY.md` already uses. The
Refund Policy is one idea with one name, so it is one module called
`refund-policy` — not `refundUtils`, and not three files named after the
conditions it checks.

**This repository does not follow this rule yet, and you should know that
before you read it.** There is no service layer. Every query, every rule and
every aggregation lives inline in the loader or action that needed it, and the
ones two routes both needed live inline twice. That is the state the code is
in. The rule above is what we are moving towards, one module at a time, and a
change that leaves one more thing behind a callable interface than it found is
a change in the right direction.

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
