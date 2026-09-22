# Spec: Bookmarks and Notes

## Why

A Student working through a Course loses the Lesson they meant to come back
to, and writes their notes somewhere that is not Cadence. Both are small,
both are the same shape: something a Student attaches to a Lesson, for
themselves.

## The two ideas

**Bookmark** — a Student's flag on a Lesson, so they can find it again. A flag
and nothing else: no title, no ordering the Student controls.

**Note** — a Student's own writing about a Lesson. Private to the Student who
wrote it.

## Rules

1. One Bookmark per Student per Lesson. Bookmarking a Lesson that is already
   bookmarked removes the Bookmark — the control is a toggle.
2. One Note per Student per Lesson. Saving again replaces the body and moves
   the "last edited" time on.
3. A Note is plain text, at most 2,000 characters. It is never rendered as
   Markdown.
4. **A Note is private to the Student who wrote it.** Not the Course's
   Instructor, not a Platform Admin, nobody. Nothing in the app may show a Student's
   Note to another person.
5. Only a Student with content access to the Course may bookmark or note its
   Lessons — the same bar the Lesson's discussion already sets.
6. An approved Refund does not erase a Student's Bookmarks or Notes. They stop
   being reachable because the Course pages stop being reachable.

## Screens

**On the Lesson page.** A bookmark toggle beside the Lesson title. A note box
under the video: the Student's Note if they have one, empty if they do not, a
Save button, and the "last edited" time when there is one.

**A Saved page**, at `/saved`, reached from the sidebar. Two lists: the
Student's Bookmarks, and the Student's Notes, each newest first, each row
linking to its Lesson and naming the Course it belongs to. Nobody else's rows
appear on it.

## Out of scope

- Folders, tags or any grouping of Bookmarks.
- Sharing a Note, or exporting one.
- Notes on a Course or a Module. A Note hangs off a Lesson only.
