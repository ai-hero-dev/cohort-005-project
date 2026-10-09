import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { createComment, deleteComment, editComment } from "./comments.server";
import {
  fakeNotifications,
  type FakeNotifications,
  type SentNotification,
} from "./notifications.fake.server";
import type { NotificationKind } from "./notification-feed";

const NOW = new Date(2026, 9, 6, 12, 0, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let moduleId: number;
let lessonId: number;
let notifications: FakeNotifications;

beforeEach(() => {
  notifications = fakeNotifications();
  db = createTestDb();
  base = seedBaseData(db);

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();
  moduleId = module.id;

  lessonId = db
    .insert(schema.lessons)
    .values({ moduleId: module.id, title: "Lesson 1", position: 1 })
    .returning()
    .get().id;
});

describe("creating a comment", () => {
  it("posts a Discussion Question with the body trimmed", async () => {
    const result = await createComment(
      db,
      base.user.id,
      lessonId,
      null,
      "  How does this work?  ",
      NOW,
      notifications
    );

    expect(result).toMatchObject({
      ok: true,
      comment: {
        userId: base.user.id,
        lessonId,
        parentId: null,
        body: "How does this work?",
        createdAt: NOW.toISOString(),
      },
    });
  });

  it("refuses a body that is only whitespace", async () => {
    expect(
      await createComment(
        db,
        base.user.id,
        lessonId,
        null,
        "   ",
        NOW,
        notifications
      )
    ).toEqual({ ok: false, error: "Comment cannot be empty" });
  });

  it("refuses a body over 5000 characters", async () => {
    expect(
      await createComment(
        db,
        base.user.id,
        lessonId,
        null,
        "a".repeat(5001),
        NOW,
        notifications
      )
    ).toEqual({
      ok: false,
      error: "Comment must be 5000 characters or fewer",
    });
  });

  it("refuses a lesson that does not exist", async () => {
    expect(
      await createComment(
        db,
        base.user.id,
        9999,
        null,
        "Hello",
        NOW,
        notifications
      )
    ).toEqual({
      ok: false,
      error: "Lesson not found",
    });
  });

  it("posts a Discussion Reply under a Discussion Question", async () => {
    const question = await post(null);

    expect(
      await createComment(
        db,
        base.instructor.id,
        lessonId,
        question.id,
        "Like so.",
        NOW,
        notifications
      )
    ).toMatchObject({ ok: true, comment: { parentId: question.id } });
  });

  it("keeps replies one level deep", async () => {
    const question = await post(null);
    const reply = await post(question.id);

    expect(
      await createComment(
        db,
        base.user.id,
        lessonId,
        reply.id,
        "Thanks!",
        NOW,
        notifications
      )
    ).toEqual({ ok: false, error: "Replies can only be one level deep" });
  });

  it("refuses a reply to a comment that does not exist", async () => {
    expect(
      await createComment(
        db,
        base.user.id,
        lessonId,
        9999,
        "Hello",
        NOW,
        notifications
      )
    ).toEqual({ ok: false, error: "Parent comment not found" });
  });

  it("refuses a reply to a comment on a different lesson", async () => {
    const otherLessonId = db
      .insert(schema.lessons)
      .values({ moduleId: moduleId, title: "Lesson 2", position: 2 })
      .returning()
      .get().id;
    const question = await post(null, otherLessonId);

    expect(
      await createComment(
        db,
        base.user.id,
        lessonId,
        question.id,
        "Hello",
        NOW,
        notifications
      )
    ).toEqual({
      ok: false,
      error: "Parent comment belongs to a different lesson",
    });
  });
});

describe("the Discussion Reply Notification", () => {
  it("tells the question's author when someone else replies", async () => {
    const question = await post(null);

    const reply = await postAs(
      base.instructor.id,
      question.id,
      "  Good question!   Here is\n the answer.  "
    );

    expect(sentOf("discussion-reply")).toEqual([
      {
        kind: "discussion-reply",
        idempotencyKey: `discussion-reply:${reply.id}`,
        recipient: {
          id: base.user.id,
          name: "Test User",
          email: "test@example.com",
          avatarUrl: null,
        },
        actor: {
          id: base.instructor.id,
          name: "Test Instructor",
          email: "instructor@example.com",
          avatarUrl: null,
        },
        data: {
          commentId: reply.id,
          questionId: question.id,
          lessonId,
          lessonTitle: "Lesson 1",
          snippet: "Good question! Here is the answer.",
          url: `/courses/test-course/lessons/${lessonId}#comment-${reply.id}`,
        },
      },
    ]);
  });

  it("sends nothing when the author replies to their own question", async () => {
    const question = await post(null);

    await postAs(base.user.id, question.id, "Never mind, I worked it out.");

    expect(sentOf("discussion-reply")).toEqual([]);
  });

  it("tells only the question's author, not others in the thread", async () => {
    const question = await post(null);
    const ben = addLearner("Ben");
    await postAs(ben.id, question.id, "Same question here.");
    notifications.sent.length = 0;

    await postAs(base.instructor.id, question.id, "Here is the answer.");

    expect(sentOf("discussion-reply").map((n) => n.recipient.id)).toEqual([
      base.user.id,
    ]);
  });

  it("cuts a long reply down to a one-line snippet", async () => {
    const question = await post(null);

    await postAs(base.instructor.id, question.id, "word ".repeat(100));

    const [sent] = sentOf("discussion-reply");
    if (!sent) throw new Error("Nothing sent");
    expect(sent.data.snippet).toHaveLength(140);
    expect(sent.data.snippet.endsWith("…")).toBe(true);
  });

  it("still saves the reply when the port fails, and logs it", async () => {
    const question = await post(null);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    notifications.failWith(new Error("Knock is down"));

    const result = await createComment(
      db,
      base.instructor.id,
      lessonId,
      question.id,
      "Here is the answer.",
      NOW,
      notifications
    );

    expect(result).toMatchObject({
      ok: true,
      comment: { parentId: question.id },
    });
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining("discussion-reply:"),
      "Knock is down"
    );
    logged.mockRestore();
  });
});

describe("the Discussion Question Notification", () => {
  it("tells the course's Instructor when a Student asks", async () => {
    const question = await postAs(
      base.user.id,
      null,
      "  How does\n this work?  "
    );

    expect(sentOf("discussion-question")).toEqual([
      {
        kind: "discussion-question",
        idempotencyKey: `discussion-question:${question.id}`,
        recipient: {
          id: base.instructor.id,
          name: "Test Instructor",
          email: "instructor@example.com",
          avatarUrl: null,
        },
        actor: {
          id: base.user.id,
          name: "Test User",
          email: "test@example.com",
          avatarUrl: null,
        },
        data: {
          commentId: question.id,
          lessonId,
          lessonTitle: "Lesson 1",
          snippet: "How does this work?",
          url: `/courses/test-course/lessons/${lessonId}#comment-${question.id}`,
        },
      },
    ]);
  });

  it("tells the Instructor when a Platform Admin asks", async () => {
    const admin = db
      .insert(schema.users)
      .values({
        name: "Ada Admin",
        email: "ada@example.com",
        role: schema.UserRole.Admin,
      })
      .returning()
      .get();

    await postAs(admin.id, null, "Is this lesson up to date?");

    expect(
      sentOf("discussion-question").map((n) => [n.recipient.id, n.actor?.id])
    ).toEqual([[base.instructor.id, admin.id]]);
  });

  it("sends nothing for the Instructor's own top-level comment", async () => {
    await postAs(base.instructor.id, null, "Welcome to the lesson!");

    expect(notifications.sent).toEqual([]);
  });

  it("is not sent for a Discussion Reply", async () => {
    const question = await post(null);
    notifications.sent.length = 0;

    await postAs(addLearner("Ben").id, question.id, "Same question here.");

    expect(sentOf("discussion-question")).toEqual([]);
  });

  it("still saves the question when the port fails, and logs it", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    notifications.failWith(new Error("Knock is down"));

    const result = await createComment(
      db,
      base.user.id,
      lessonId,
      null,
      "How does this work?",
      NOW,
      notifications
    );

    expect(result).toMatchObject({ ok: true, comment: { parentId: null } });
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining("discussion-question:"),
      "Knock is down"
    );
    logged.mockRestore();
  });
});

describe("deleting a comment", () => {
  it("lets the author soft-delete their own comment", async () => {
    const question = await post(null);

    expect(
      await deleteComment(
        db,
        question.id,
        base.user.id,
        false,
        NOW,
        notifications
      )
    ).toMatchObject({
      ok: true,
      comment: { id: question.id, deletedAt: NOW.toISOString() },
    });
  });

  it("refuses anyone else who is not staff", async () => {
    const question = await post(null);
    const otherStudent = db
      .insert(schema.users)
      .values({
        name: "Ben",
        email: "ben@example.com",
        role: schema.UserRole.Student,
      })
      .returning()
      .get();

    expect(
      await deleteComment(
        db,
        question.id,
        otherStudent.id,
        false,
        NOW,
        notifications
      )
    ).toEqual({ ok: false, error: "You can only delete your own comments" });
  });

  it("lets staff delete anyone's comment", async () => {
    const question = await post(null);

    expect(
      await deleteComment(
        db,
        question.id,
        base.instructor.id,
        true,
        NOW,
        notifications
      )
    ).toMatchObject({ ok: true, comment: { deletedAt: NOW.toISOString() } });
  });

  it("keeps the first deletion time when deleted twice", async () => {
    const question = await post(null);
    await deleteComment(
      db,
      question.id,
      base.user.id,
      false,
      NOW,
      notifications
    );
    const later = new Date(2026, 9, 7, 12, 0, 0);

    expect(
      await deleteComment(
        db,
        question.id,
        base.user.id,
        false,
        later,
        notifications
      )
    ).toMatchObject({ ok: true, comment: { deletedAt: NOW.toISOString() } });
  });
});

describe("deleting a comment's Notifications", () => {
  it("removes a deleted Discussion Question from the Instructor's feed", async () => {
    const question = await post(null);
    const other = await postAs(base.user.id, null, "Another question.");

    await deleteComment(
      db,
      question.id,
      base.user.id,
      false,
      NOW,
      notifications
    );

    expect(
      notifications.feedOf(base.instructor.id).map((n) => n.idempotencyKey)
    ).toEqual([`discussion-question:${other.id}`]);
  });

  it("removes a deleted Discussion Reply from the question author's feed", async () => {
    const question = await post(null);
    const reply = await postAs(base.instructor.id, question.id, "Like so.");

    await deleteComment(
      db,
      reply.id,
      base.instructor.id,
      true,
      NOW,
      notifications
    );

    expect(notifications.feedOf(base.user.id)).toEqual([]);
  });

  it("leaves the replies' Notifications when a Discussion Question is deleted", async () => {
    const question = await post(null);
    const reply = await postAs(base.instructor.id, question.id, "Like so.");

    await deleteComment(
      db,
      question.id,
      base.user.id,
      false,
      NOW,
      notifications
    );

    expect(notifications.feedOf(base.instructor.id)).toEqual([]);
    expect(
      notifications.feedOf(base.user.id).map((n) => n.idempotencyKey)
    ).toEqual([`discussion-reply:${reply.id}`]);
  });

  it("leaves Notifications alone when the delete is refused", async () => {
    const question = await post(null);

    await deleteComment(
      db,
      question.id,
      addLearner("Ben").id,
      false,
      NOW,
      notifications
    );

    expect(notifications.feedOf(base.instructor.id)).toHaveLength(1);
  });

  it("still deletes the comment when the port fails, and logs it", async () => {
    const question = await post(null);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    notifications.failWith(new Error("Knock is down"));

    const result = await deleteComment(
      db,
      question.id,
      base.user.id,
      false,
      NOW,
      notifications
    );

    expect(result).toMatchObject({
      ok: true,
      comment: { deletedAt: NOW.toISOString() },
    });
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining(`comment:${question.id}`),
      "Knock is down"
    );
    logged.mockRestore();
  });
});

describe("editing a comment", () => {
  it("saves the new body and marks it edited", async () => {
    const question = await post(null);
    const later = new Date(2026, 9, 7, 12, 0, 0);

    expect(
      editComment(db, question.id, base.user.id, "  Clearer question.  ", later)
    ).toMatchObject({
      ok: true,
      comment: { body: "Clearer question.", editedAt: later.toISOString() },
    });
  });

  it("refuses anyone but the author", async () => {
    const question = await post(null);

    expect(
      editComment(db, question.id, base.instructor.id, "Hijacked.", NOW)
    ).toEqual({ ok: false, error: "You can only edit your own comments" });
  });

  it("refuses a deleted comment", async () => {
    const question = await post(null);
    await deleteComment(
      db,
      question.id,
      base.user.id,
      false,
      NOW,
      notifications
    );

    expect(editComment(db, question.id, base.user.id, "Back.", NOW)).toEqual({
      ok: false,
      error: "Comment has been deleted",
    });
  });

  it("refuses an empty body", async () => {
    const question = await post(null);

    expect(editComment(db, question.id, base.user.id, "   ", NOW)).toEqual({
      ok: false,
      error: "Comment cannot be empty",
    });
  });

  it("leaves the Notification as it was sent", async () => {
    const question = await postAs(base.user.id, null, "First wording.");

    editComment(db, question.id, base.user.id, "Second wording.", NOW);

    expect(
      notifications.feedOf(base.instructor.id).map((n) => n.data)
    ).toMatchObject([{ snippet: "First wording." }]);
  });
});

async function post(parentId: number | null, onLessonId = lessonId) {
  const result = await createComment(
    db,
    base.user.id,
    onLessonId,
    parentId,
    "A comment.",
    NOW,
    notifications
  );
  if (!result.ok) throw new Error(result.error);
  return result.comment;
}

async function postAs(authorId: number, parentId: number | null, body: string) {
  const result = await createComment(
    db,
    authorId,
    lessonId,
    parentId,
    body,
    NOW,
    notifications
  );
  if (!result.ok) throw new Error(result.error);
  return result.comment;
}

function addLearner(name: string) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase()}@example.com`,
      role: schema.UserRole.Student,
    })
    .returning()
    .get();
}

function sentOf<K extends NotificationKind>(kind: K) {
  return notifications.sent.filter(
    (n): n is Extract<SentNotification, { kind: K }> => n.kind === kind
  );
}
