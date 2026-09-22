# Coding standards: components

Applies to `app/components/` and to the component half of a route module. The
root `CODING_STANDARDS.md` applies here too.

## Derive, do not store

If a value can be worked out from state you already hold, work it out on
render. Storing it gives you two things that must agree, and one day they will
not.

```tsx
// Bad
const [items, setItems] = useState(rows);
const [count, setCount] = useState(rows.length);

// Good
const [items, setItems] = useState(rows);
const count = items.length;
```

## Every item in a list gets a stable key

The index is not a key. When the list is reordered, every row below the change
is rebuilt, and anything the row was holding — focus, a half-typed input — is
lost. Use the row's id.

## A component does not reach the database

Not through `~/db`, and not through a helper that does it for you. A component
is bundled for the browser, and the browser cannot open `data.db` — the import
alone takes the whole client bundle down, React never hydrates, and the page
renders and then does nothing. `typecheck` and `test` both stay green.

The query belongs in the loader of the route that renders the component. The
component takes the answer as a prop.

A comment saying "server only" above the helper is not a guard. It did not
stop the import, because nothing reads it. Move the code; do not annotate it.

## No side effect in the render path

Render works out what the output is. It does not write, fetch, or reach for
`document`. Anything that touches the outside world belongs in an effect, or
in the action the form posts to.

## An effect declares every value it reads

If the effect reads it, it is in the dependency array. Leaving it out is a bug
that stays hidden until the value changes.

## Do not mutate a prop, or anything handed to you

Copy it, change the copy, hand the copy back.

## Use the element that means it

A `div` with an `onClick` is a button nobody can reach with a keyboard. Use
`button`, `a`, `label`, `nav`. Do not set a positive `tabIndex`, and do not
remove the focus ring — restyle it if you must, but leave something visible.

## Every input has a label, every image has alt text

A decorative image takes `alt=""`, not no attribute.

## Colour is never the only signal

A red border needs a message beside it.

## Style with the design tokens

`text-muted-foreground`, never `#6b7280`. An inline style is for a computed
value — a progress width — and nothing else.

## Never render somebody's text as HTML

`dangerouslySetInnerHTML` takes the output of `renderComment`, which sanitises.
It never takes a string a person typed.
