import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import { getNote, listNotes, saveNote } from "./notes.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

function minutesAfterNow(minutes: number) {
  return new Date(NOW.getTime() + minutes * 60_000);
}

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonIds: number[];

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();

  lessonIds = [1, 2].map(
    (position) =>
      db
        .insert(schema.lessons)
        .values({ moduleId: module.id, title: `Lesson ${position}`, position })
        .returning()
        .get().id
  );
});

describe("saving a Note", () => {
  it("writes a Note with the body trimmed", () => {
    saveNote(db, base.user.id, lessonIds[0], "  Rewatch at 4:20  ", NOW);

    expect(getNote(db, base.user.id, lessonIds[0])).toMatchObject({
      body: "Rewatch at 4:20",
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
  });

  it("replaces the body and moves the last-edited time on when saved again", () => {
    saveNote(db, base.user.id, lessonIds[0], "First thought", NOW);
    saveNote(db, base.user.id, lessonIds[0], "Second thought", minutesAfterNow(5));

    expect(getNote(db, base.user.id, lessonIds[0])).toMatchObject({
      body: "Second thought",
      createdAt: NOW.toISOString(),
      updatedAt: minutesAfterNow(5).toISOString(),
    });
  });

  it("never leaves a Student with two Notes on the same Lesson", () => {
    saveNote(db, base.user.id, lessonIds[0], "First thought", NOW);
    saveNote(db, base.user.id, lessonIds[0], "Second thought", NOW);

    expect(listNotes(db, base.user.id)).toHaveLength(1);
    expect(() =>
      db
        .insert(schema.notes)
        .values({ userId: base.user.id, lessonId: lessonIds[0], body: "Dupe" })
        .run()
    ).toThrow();
  });

  it("accepts a Note of exactly 2000 characters", () => {
    expect(saveNote(db, base.user.id, lessonIds[0], "a".repeat(2000), NOW)).toMatchObject({
      ok: true,
    });
  });

  it("refuses a Note over 2000 characters", () => {
    expect(saveNote(db, base.user.id, lessonIds[0], "a".repeat(2001), NOW)).toEqual({
      ok: false,
      error: "Note must be 2000 characters or fewer",
    });
    expect(getNote(db, base.user.id, lessonIds[0])).toBeUndefined();
  });

  it("refuses a Note that is only whitespace", () => {
    expect(saveNote(db, base.user.id, lessonIds[0], "   ", NOW)).toEqual({
      ok: false,
      error: "Write something before saving your note",
    });
  });

  it("keeps the body exactly as typed, Markdown characters included", () => {
    saveNote(db, base.user.id, lessonIds[0], "# not a heading\n*not bold*", NOW);

    expect(getNote(db, base.user.id, lessonIds[0])?.body).toBe(
      "# not a heading\n*not bold*"
    );
  });
});

describe("listing Notes", () => {
  it("lists only the Student's own Notes, most recently edited first, with their Lesson and Course", () => {
    const other = db
      .insert(schema.users)
      .values({ name: "Other", email: "other@example.com", role: UserRole.Student })
      .returning()
      .get();
    saveNote(db, base.user.id, lessonIds[0], "On lesson 1", NOW);
    saveNote(db, base.user.id, lessonIds[1], "On lesson 2", minutesAfterNow(5));
    saveNote(db, base.user.id, lessonIds[0], "On lesson 1, edited", minutesAfterNow(10));
    saveNote(db, other.id, lessonIds[0], "Someone else's", minutesAfterNow(15));

    expect(listNotes(db, base.user.id)).toMatchObject([
      {
        body: "On lesson 1, edited",
        lesson: {
          id: lessonIds[0],
          title: "Lesson 1",
          courseTitle: "Test Course",
          courseSlug: "test-course",
        },
      },
      {
        body: "On lesson 2",
        lesson: {
          id: lessonIds[1],
          title: "Lesson 2",
          courseTitle: "Test Course",
          courseSlug: "test-course",
        },
      },
    ]);
  });
});
