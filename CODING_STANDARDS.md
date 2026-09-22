# Coding standards

These rules carry over from the AI Coding Crash Course. They are short on
purpose. Add a rule when a review or a retro shows you need one — not before.

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

## Never mutate a value you were handed

Take a copy, change the copy, hand the copy back. A caller that passed you
something does not expect to find it different afterwards.

## Every item in a list gets a stable key

The index of an item is not a key. When the list is reordered, every row
below the change is rebuilt, and anything the row was holding is lost. Use
the row's id.

## Split a component when it grows a second reason to change

A component that both fetches and lays out is two components. Pull the layout
out and pass it what it needs.

## Do not put a side effect in the render path

Rendering is for working out what the output is, not for doing something.
Anything that touches the outside world belongs in an effect or an action.

## Effects declare every value they read

If an effect reads a value, that value is in the dependency array. Leaving it
out is a bug that will not show up until the value changes.

## Hoist a constant out of the body

A value that does not depend on anything in the body goes outside the body,
so it is built once instead of on every pass.

## Prefer composition to configuration

A function that takes a `mode` flag and branches on it is two functions that
have not been separated yet. The same goes for a component with a `variant`
prop that changes what it renders rather than how it looks.

## Select the columns you need, never all of them

`select *` reads pages you do not want and ties the caller to the shape of
the table. Name the columns.

## Index every foreign key

A foreign key without an index is a table scan on every join. Add the index
in the same change that adds the key.

## Wrap related writes in a transaction

Two writes that must both land, or neither, go in a transaction. If the second
one fails and the first stayed, you have invented a state nothing knows how to
read.

## Never build a query by joining strings

Parameterise. String concatenation is how injection gets in, and it is also
how a quote in somebody's name takes the page down.

## Paginate anything that can grow

A query with no limit is fine on a seeded database and fatal on a real one.
If the row count is a function of how long the product has been alive, add a
limit.

## Avoid the N+1

One query in a loop is N+1 queries. Use a join, or one query with an `IN`.

## Migrations are forward-only

Never edit a migration that has been applied. Write another one.

## Timestamps are stored as ISO strings in UTC

A local time in a column is a bug waiting for somebody in another country.

## Money is stored in integer cents

Never a float. Floats cannot hold a tenth.

## Soft-delete anything a person can point at

If another row references it, or a person has a link to it, do not delete it.
Mark it deleted and filter it out on read.

## Enumerations live in the schema file

A status string that the code compares against is an enum in `app/db/schema.ts`,
not a literal repeated in six places.

## Name a boolean so it reads as a question

`isPublished`, `hasSeats`, `canRefund`. Not `published`, `seats`, `refund`.

## Name a function for what it returns, not how it works

`getPendingRefunds`, not `queryRefundsTableFilteredByStatus`.

## Do not abbreviate

`request`, not `req`. `error`, not `e`. The only exceptions are `id` and `url`,
which are longer written out.

## Use `const` unless you reassign

If you reassign, use `let`. Never `var`.

## Use `===`, never `==`

`==` coerces, and the coercion table is not something anybody remembers.

## Prefer arrow functions for callbacks

`items.map((item) => item.id)`, not `items.map(function (item) { … })`.

## Two-space indentation

Not four, not tabs.

## Double quotes for strings

Single quotes only inside a double-quoted string.

## Semicolons at the end of every statement

Do not rely on automatic semicolon insertion.

## Trailing commas in multi-line literals

The diff is smaller when the next line is added.

## No trailing whitespace

Strip it before you commit.

## Every file ends with a newline

## Lines wrap at 80 characters

## Imports are sorted: packages, then aliases, then relative

Within each group, alphabetically.

## One export per line

Do not put two exported symbols on one line.

## No `console.log` left in a committed file

`console.error` in a catch block is fine.

## Do not leave commented-out code

Git has it. Delete it.

## No TODO without a name and a date

`// TODO(matt, 2026-03-01): …`. A TODO with nobody's name on it is a wish.

## Do not export something only one file uses

Keep it private until a second caller appears.

## Default exports only for route modules

Everything else is a named export.

## Prefer `interface` for object shapes, `type` for unions

## Do not write a type that the compiler can infer

`const count: number = items.length` says nothing the compiler did not know.

## Return early rather than nesting

A guard clause at the top beats an `else` at the bottom.

## Keep a function under fifty lines

If it is longer, it is doing more than one thing.

## Keep a file under five hundred lines

## No more than three parameters

Past three, take an object.

## Do not use a default parameter to hide a required one

If the caller must always pass it, make them.

## Throw `Error`, never a string

## Catch the narrowest thing you can

A bare `catch` that swallows everything hides the bug you are about to spend
a day on.

## Log the error, not just the message

The stack is the useful part.

## Validate at the edge, trust inside

Parse once, at the boundary. After that the value has a type and you do not
check it again.

## Never trust a number that came from a form

`Number("")` is `0`, and `0` is a valid id in most schemas.

## Do not catch an error only to re-throw it unchanged

## Assert an invariant rather than commenting it

## Prefer a pure function

If it can be written without reading the clock, the database or the network,
write it that way. It is the only kind of function that is pleasant to test.

## Inject the clock

A function that calls `Date.now()` cannot be tested at a fixed moment. Take
the time as an argument.

## One assertion per test, where you can manage it

A test that fails should tell you what is broken without being read.

## Name a test for the behaviour, not the function

`"refuses a refund after the window closes"`, not `"refund test 3"`.

## Do not test the framework

## Do not mock what you own

## Keep the fixture close to the test

A shared fixture that every test bends is worse than a little duplication.

## Do not commit a skipped test

## Write the test before the fix

Otherwise you do not know the fix worked.

## A pull request does one thing

If the title needs an "and", it is two pull requests.

## The branch name matches the ticket

## Rebase, do not merge, before you open a pull request

## Squash before landing

## A commit message says why

The diff already says what.

## Do not commit a lockfile change you did not intend

## Do not commit generated files

## Run the checks before you push

## Accessibility: every input has a label

## Accessibility: every image has alt text

Decorative images take `alt=""`, not no attribute.

## Accessibility: do not remove the focus ring

Restyle it if you must, but leave something visible.

## Accessibility: colour is never the only signal

## Use semantic elements

A `div` with an `onClick` is a button that nobody can tab to.

## Do not set a positive `tabIndex`

## Keep the heading levels in order

## Styling: use the design tokens

Never a raw hex value. `text-muted-foreground`, not `#6b7280`.

## Styling: no inline styles except for a computed value

A width that is a percentage of progress is fine. A colour is not.

## Styling: mobile first

Write the small-screen rule, then widen it.

## Styling: do not nest more than three levels

## Performance: do not read from the database in a loop

## Performance: measure before you optimise

## Performance: lazy-load anything below the fold

## Performance: debounce anything that fires on keystroke

## Security: never log a secret

## Security: never put a secret in the client bundle

Anything the browser can read is public.

## Security: check permission in the action, not only the loader

A loader guard does not protect an action. They are separate requests.

## Security: escape anything a person typed before you render it as HTML

## Security: set `rel="noopener noreferrer"` on every external link
