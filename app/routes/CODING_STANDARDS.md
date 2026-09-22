# Coding standards: routes

Applies to `app/routes/` — loaders, actions, and anything they reach. The root
`CODING_STANDARDS.md` applies here too, and its first three rules are about
this directory more than any other.

## Check permission in the action, not only in the loader

A loader guard does not protect an action. They are separate requests, and a
form can be posted to a route the poster never rendered. Every action that
writes calls the guard it needs — `requireUserId`, `requireContentAccess`,
`requireStaff` — before it writes.

## Parse at the edge, then trust the value

`parseFormData`, `parseParams` and `parseJsonBody` are where checking happens.
After the parse the value has a type, and nothing downstream checks it again.
A second check downstream means the parse is not doing its job.

## Never trust a number that arrived as a string

`Number("")` is `0`, and `0` is a valid id in most of this schema. Coerce
inside the schema (`z.coerce.number().int().positive()`), never with `Number()`
and an `isNaN` check.

## Scope every write to the signed-in user

An id that came from a form is somebody's guess until the `where` clause says
otherwise. Put the user id in the `where`, not in an `if` above it.

## Never put a secret in the loader's return value

Everything a loader returns is serialised to the browser. An environment
variable that is a credential stays on the server.

## Never log a secret

Not the key, not a prefix of the key, not the request that carries it.

## A missing vendor does not fail the request

A third-party call that is not the point of the request is wrapped and logged,
never awaited into the failure path. The database write is the thing that
happened; the vendor is how somebody hears about it.
