# Route files use dot-separated names

`app/routes/courses.$slug.lessons.$lessonId.tsx` rather than nested folders.
One flat directory means the URL of a route is readable from its filename and
there are no `index.tsx` files to tell apart.
