# Coding standards

**A workflow reads this file now, not a person.** `.github/workflows/agent-review.yml`
fetches it on every review, quotes the heading of the rule it is applying, and
posts the verdict on the pull request. Two things follow. A rule nobody can
apply from the diff alone is a rule the reviewer will skip, so write each one so
it can be checked against a patch. And a rule you add here is a rule that is
applied to every change from the next run onwards, with nobody in the room to
soften it — which is the reason to keep the list this short.

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
