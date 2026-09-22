# Coding standards

These rules carry over from the AI Coding Crash Course. They are short on
purpose. Add a rule when a review or a retro shows you need one — not before.

**A workflow reads this file now, not a person.** `.github/workflows/agent-review.yml`
fetches it on every review, quotes the heading of the rule it is applying, and
posts the verdict on the pull request. Two things follow. A rule nobody can
apply from the diff alone is a rule the reviewer will skip, so write each one so
it can be checked against a patch. And a rule you add here is a rule that is
applied to every change from the next run onwards, with nobody in the room to
soften it — which is the reason to keep the list this short.

**A `CODING_STANDARDS.md` applies to the directory it sits in, and everything
under it.** This file is the root, so the eight rules below apply everywhere.
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

**The repository follows this rule now, and it did not always.** There was a
point where there was no service layer at all: every query, every rule and
every aggregation lived inline in the loader that needed it, and the ones two
routes both needed lived inline twice. `app/services/` is what that was traded
for, one module at a time — see [docs/rfcs/0001-earn-back-the-service-layer.md](./docs/rfcs/0001-earn-back-the-service-layer.md).

So the rule is no longer a direction of travel. A change that puts a new rule
back inline in a loader is a change that goes backwards, and the reviewer says
so.

## Import a service through its entry points, never into its subfolders

Every directory under `app/services/` is a deep module. Its **entry points**
are its root files, and they are its whole public surface. Everything in a
subfolder — `lib/`, `tests/`, anything else you add — is implementation, and is
private.

```ts
import { summariseRefundExposure } from "~/services/refund-window"; // yes
import { utcDay } from "~/services/refund-window/lib/utc-days"; // no
```

This is the rule that makes the one above it worth anything. A module whose
interface hides its implementation only hides it while nobody is allowed to
reach past it. Give one caller a deep import and the implementation is now the
interface, and you find that out the day you try to change it.

Three things follow, and they are the ones people get wrong:

- **A module's own tests go through the entry points too.** A test that imports
  `lib/` is a test of the implementation, and it fails the next time the
  implementation is correctly rewritten.
- **Do not write a barrel.** An `index.ts` that re-exports the whole subtree has
  an interface as wide as its implementation. Expose several small entry points
  instead.
- **Two modules that import each other are one module.** Cycles are an error.

`npm run lint:boundaries` enforces all of this with dependency-cruiser, and
`.husky/pre-commit` runs it. The rules are errors, not warnings. See
[app/services/README.md](./app/services/README.md).

## Leave the change somewhere a test can reach

The retro that wrote this rule looked at a run that passed. The ticket was
built unattended, the reviewer posted **Standards: PASS** and **Spec: PASS**,
and the pull request was, on every signal the factory produces, good work.

Then somebody ran `npm test` and noticed it said what it said the day before:
twelve files, four hundred and thirty tests, and not one of them touches the
feature that was just added. The whole change had landed inside a loader. No
test imports a route module — a loader needs a `Request` and a database — so
every line of it came back uncovered, and the suite stayed green by never
looking. The reviewer passed it because a reviewer reads a diff against the
rules, and no rule said this.

So: **a change is not done until some part of the suite would go red if the
change were wrong.**

In practice that means the same split the deep-module rules already ask for,
now with teeth:

- The rule, the calculation, the aggregation, the decision — put it in a
  module under `app/services/`, behind an entry point a test can call with
  plain values. That is what makes it gradeable.
- The loader keeps what is genuinely the loader's: read the request, call the
  module, throw or return. There is nothing left in it worth a test.
- Write the tests in the same change, not in a follow-up ticket. A follow-up
  ticket for tests is a ticket that does not get built.

**How to tell you have it wrong.** Run `npm test` before and after. If the
count of passing tests is identical, either you changed nothing that can be
wrong, or you put the part that can be wrong somewhere the suite cannot see.
`npm run test:mutation` is the sharper version of the same question: it scores
`app/lib/`, `app/services/` and `request-logger/`, and a change that produces
no mutants at all has told you where it landed.

This rule exists because the factory's two signals — a green suite and a
passing review — can now both be true about a change nothing has actually
checked. Neither agent is lying. They are answering the questions they were
asked, and until this rule, nobody was asking this one.

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
