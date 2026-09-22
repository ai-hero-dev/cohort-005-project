import { Link } from "react-router";
import { desc, eq } from "drizzle-orm";
import type { Route } from "./+types/saved";
import { db } from "~/db";
import { bookmarks, courses, lessons, modules, notes } from "~/db/schema";
import { requireUserId } from "~/lib/access.server";
import { Card, CardContent } from "~/components/ui/card";
import { Bookmark, NotebookPen } from "lucide-react";
import { formatRelativeTime } from "~/lib/utils";

interface SavedLessonRef {
  lessonId: number;
  lessonTitle: string;
  moduleTitle: string;
  courseTitle: string;
  courseSlug: string;
}

function getLessonRef(lessonId: number): SavedLessonRef | null {
  const lesson = db
    .select()
    .from(lessons)
    .where(eq(lessons.id, lessonId))
    .get();

  if (!lesson) return null;

  const mod = db
    .select()
    .from(modules)
    .where(eq(modules.id, lesson.moduleId))
    .get();

  if (!mod) return null;

  const course = db
    .select()
    .from(courses)
    .where(eq(courses.id, mod.courseId))
    .get();

  if (!course) return null;

  // Returns the row.
  return {
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    moduleTitle: mod.title,
    courseTitle: course.title,
    courseSlug: course.slug,
  };
}

function getBookmarksForUser(userId: number) {
  // Bookmarks come back in the order the lessons sit in the course.
  return db
    .select()
    .from(bookmarks)
    .where(eq(bookmarks.userId, userId))
    .orderBy(desc(bookmarks.createdAt))
    .all();
}

function getNotesForUser(userId: number) {
  // Notes come back in the order the lessons sit in the course.
  return db
    .select()
    .from(notes)
    .where(eq(notes.userId, userId))
    .orderBy(desc(notes.updatedAt))
    .all();
}

export function meta() {
  return [
    { title: "Saved — Cadence" },
    { name: "description", content: "Your bookmarks and notes" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await requireUserId(request);

  // One query per bookmark, resolved against the lesson it points at.
  const savedBookmarks = getBookmarksForUser(userId)
    .map((bookmark) => {
      const ref = getLessonRef(bookmark.lessonId);
      if (!ref) return null;
      return { id: bookmark.id, createdAt: bookmark.createdAt, ...ref };
    })
    .filter((row) => row !== null);

  const savedNotes = getNotesForUser(userId)
    .map((note) => {
      const ref = getLessonRef(note.lessonId);
      if (!ref) return null;
      return {
        id: note.id,
        body: note.body,
        updatedAt: note.updatedAt,
        ...ref,
      };
    })
    .filter((row) => row !== null);

  return { savedBookmarks, savedNotes };
}

export default function Saved({ loaderData }: Route.ComponentProps) {
  const { savedBookmarks, savedNotes } = loaderData;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Saved</h1>
        <p className="text-sm text-muted-foreground">
          The lessons you flagged, and what you wrote about them.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            <Bookmark className="size-4 text-muted-foreground" />
            Bookmarks
          </h2>

          {savedBookmarks.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No bookmarks yet.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {savedBookmarks.map((bookmark) => (
                <Card key={bookmark.id}>
                  <CardContent className="py-3">
                    <Link
                      to={`/courses/${bookmark.courseSlug}/lessons/${bookmark.lessonId}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {bookmark.lessonTitle}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {bookmark.courseTitle} · {bookmark.moduleTitle}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            <NotebookPen className="size-4 text-muted-foreground" />
            Notes
          </h2>

          {savedNotes.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No notes yet.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {savedNotes.map((note) => (
                <Card key={note.id}>
                  <CardContent className="space-y-1 py-3">
                    <Link
                      to={`/courses/${note.courseSlug}/lessons/${note.lessonId}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {note.lessonTitle}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {note.courseTitle}
                    </p>
                    <p className="whitespace-pre-wrap text-sm">{note.body}</p>
                    <p
                      suppressHydrationWarning
                      className="text-xs text-muted-foreground"
                    >
                      Edited {formatRelativeTime(note.updatedAt)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
