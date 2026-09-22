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
