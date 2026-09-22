# Coding standards

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

## Keep every file under 500 lines

Count the lines before you commit. A file over 500 lines gets split, whatever
is in it — source, test, or Markdown. Lockfiles, migrations and generated
snapshots are the only exceptions.

## Wrap related writes in a transaction

Two writes that must both land, or neither, go in a transaction. If the second
one fails and the first stayed, you have invented a state nothing knows how to
read. (The refund bug: the refund was approved, the enrollment was never
ended, and the learner kept the course.)

## Two-space indentation

Not four, not tabs.

## Derive, do not store

If a value can be worked out from another value you already hold, work it out.
Storing it gives you two things that must agree, and one day they will not.

```ts
// Bad
const [items, setItems] = useState(rows);
const [count, setCount] = useState(rows.length);

// Good
const [items, setItems] = useState(rows);
const count = items.length;
```

## Check permission in the action, not only the loader

A loader guard does not protect an action. They are separate requests. For a
week anybody who was signed in could approve a refund by posting to
`/admin/refunds`.

## Name a boolean so it reads as a question

`isPublished`, `hasSeats`, `canRefund`. Not `published`, `seats`, `refund`.

## Every image has alt text

Decorative images take `alt=""`, not no attribute.

## Avoid the N+1

One query in a loop is N+1 queries. Use a join, or one query with an `IN`.

## Semicolons at the end of every statement

Do not rely on automatic semicolon insertion.

## Never trust a number that came from a form

`Number("")` is `0`, and `0` is a valid id in most schemas. An empty
`lessonId` once opened lesson 0 for every learner.

## Prefer composition to configuration

A function that takes a `mode` flag and branches on it is two functions that
have not been separated yet. The same goes for a component with a `variant`
prop that changes what it renders rather than how it looks.

## Money is stored in integer cents.

Never a float. Floats cannot hold a tenth. Regional prices came out as
`19.990000000000002` until we changed this.

### Lines wrap at 80 characters

## Don't leave commented-out code

Git has it. Delete it.

## Name a test for the behaviour, not the function

`"refuses a refund after the window closes"`, not `"refund test 3"`.

## Use the design tokens

Never a raw hex value. `text-muted-foreground`, not `#6b7280`.

## Do not put a side effect in the render path

Rendering is for working out what the output is, not for doing something.
Anything that touches the outside world belongs in an effect or an action.

## Timestamps are stored as ISO strings in UTC

A local time in a column is a bug waiting for somebody in another country. The
refund window closed a day early for learners in Sydney before this.

## Use `===`, never `==`

`==` coerces, and the coercion table is not something anybody remembers.

## A pull request does one thing

If the title needs an "and", it is two pull requests.

## Never put a secret in the client bundle

Anything the browser can read is public.

## Keep a function under fifty lines

If it is longer, it is doing more than one thing.

## Imports are sorted: packages, then aliases, then relative

Within each group, alphabetically.

## Every input has a label

## Read lesson progress through `progressCache`

Do not query the progress table from a route. `progressCache` holds the
learner's progress per lesson and falls back to the progress service when it
is cold.

## Paginate anything that can grow

A query with no limit is fine on a seeded database and fatal on a real one.
If the row count is a function of how long the product has been alive, add a
limit. The instructor's students page timed out on the first big course.

## Prefer `interface` for object shapes, `type` for unions

## Catch the narrowest thing you can

A bare `catch` that swallows everything hides the bug you are about to spend
a day on.

## Every item in a list gets a stable key

The index of an item is not a key. When the list is reordered, every row
below the change is rebuilt, and anything the row was holding is lost. Use
the row's id. (Reordering modules used to drop the half-typed lesson title.)

## Trailing commas in multi-line literals

The diff is smaller when the next line is added.

## Write the test before the fix

Otherwise you do not know the fix worked.

## Soft-delete anything a person can point at

If another row references it, or a person has a link to it, do not delete it.
Mark it deleted and filter it out on read. Deleting a lesson used to take the
learners' notes and bookmarks with it.

## Do not abbreviate

`request`, not `req`. `error`, not `e`. The only exceptions are `id` and `url`,
which are longer written out.

## Colour is never the only signal

## Mobile first

Write the small-screen rule, then widen it.

## Do not catch an error only to re-throw it unchanged

## Select the columns you need, never all of them

`select *` reads pages you do not want and ties the caller to the shape of
the table. Name the columns.

## No `console.log` left in a committed file

`console.error` in a catch block is fine.

## never log a secret

## Hoist a constant out of the body

A value that does not depend on anything in the body goes outside the body,
so it is built once instead of on every pass.

## Double quotes for strings

Single quotes only inside a double-quoted string.

## The branch name matches the ticket

## Validate at the edge, trust inside

Parse once, at the boundary. After that the value has a type and you do not
check it again.

## Keep the fixture close to the test

A shared fixture that every test bends is worse than a little duplication.

## Use semantic elements

A `div` with an `onClick` is a button that nobody can tab to.

## Index every foreign key

A foreign key without an index is a table scan on every join. Add the index
in the same change that adds the key.

## Name a function for what it returns, not how it works

`getPendingRefunds`, not `queryRefundsTableFilteredByStatus`.

## Measure before you optimise

## Never mutate a value you were handed

Take a copy, change the copy, hand the copy back. A caller that passed you
something does not expect to find it different afterwards.

### No trailing whitespace

Strip it before you commit.

## Also

- Every file ends with a newline.
- Do not set a positive `tabIndex`.
- Squash before landing.
- Throw `Error`, never a string.
- Do not test the framework.
- Strings go in double quotes, please — not single.

## Inject the clock

A function that calls `Date.now()` cannot be tested at a fixed moment. Take
the time as an argument. The refund window tests failed every night at
midnight until we did this.

## Migrations are forward-only

Never edit a migration that has been applied. Write another one.

## Use `const` unless you reassign

If you reassign, use `let`. Never `var`.

## Escape anything a person typed before you render it as HTML

## Effects declare every value they read

If an effect reads a value, that value is in the dependency array. Leaving it
out is a bug that will not show up until the value changes.

## A commit message says why

The diff already says what.

## Default exports only for route modules

Everything else is a named export.

## Log the error, not just the message

The stack is the useful part.

## Lazy-load anything below the fold

### Component props are a `type`

Write `type Props = { … }`, not `interface Props`.

## One assertion per test, where you can manage it

A test that fails should tell you what is broken without being read.

## Never build a query by joining strings

Parameterise. String concatenation is how injection gets in, and it is also
how a quote in somebody's name takes the page down.

## Return early rather than nesting

A guard clause at the top beats an `else` at the bottom.

## No inline styles except for a computed value

A width that is a percentage of progress is fine. A colour is not.

## One export per line

Do not put two exported symbols on one line.

## Do not commit a lockfile change you did not intend

## Enumerations live in the schema file

A status string that the code compares against is an enum in `app/db/schema.ts`,
not a literal repeated in six places. Refund status was `"pending"` in four
files and `"Pending"` in one.

## No more than three parameters

Past three, take an object.

## Do not remove the focus ring

Restyle it if you must, but leave something visible.

## Split a component when it grows a second reason to change

A component that both fetches and lays out is two components. Pull the layout
out and pass it what it needs.

## Prefer arrow functions for callbacks

`items.map((item) => item.id)`, not `items.map(function (item) { … })`.

## Do not commit a skipped test

## Do not read from the database in a loop

We got bitten by this in the notes loader: one query per lesson, forty lessons
per course.

## Do not export something only one file uses

Keep it private until a second caller appears.

## Keep the heading levels in order

## Rebase, do not merge, before you open a pull request

## Do not write a type that the compiler can infer

`const count: number = items.length` says nothing the compiler did not know.

## Set `rel="noopener noreferrer"` on every external link

## Do not use a default parameter to hide a required one

If the caller must always pass it, make them.

## Do not mock what you own

## No TODO without a name and a date

`// TODO(matt, 2026-03-01): …`. A TODO with nobody's name on it is a wish.

## Debounce anything that fires on keystroke

## Prefer a pure function

If it can be written without reading the clock, the database or the network,
write it that way. It is the only kind of function that is pleasant to test.

## Do not commit generated files

## Assert an invariant rather than commenting it

## Do not nest more than three levels

## Run the checks before you push
