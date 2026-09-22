# Validate form input by hand, not with a schema library

Form fields arrive as strings. Reading them with `formData.get("x") as string`
and checking them with a few `if` statements keeps the validation next to the
thing it protects and keeps a dependency out of the bundle.

Zod was considered. It was rejected as too much ceremony for four fields, and
because a schema parsed at the top of an action moves the error messages away
from the branch that cares about them.
