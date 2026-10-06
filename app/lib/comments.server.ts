import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { eq } from "drizzle-orm";
import { comments, courses, lessons, modules } from "~/db/schema";
import { MAX_COMMENT_LENGTH, MIN_COMMENT_LENGTH } from "~/lib/comments";
import {
  archiveForCommentSafely,
  sendSafely,
  findNotificationPerson,
  type Notifications,
} from "~/lib/notifications.server";

// ─── Comments ───
// Posting, editing and soft-deleting comments on a lesson: Discussion Questions and
// Discussion Replies. See GLOSSARY.md for the language.
//
// Every function takes the database first, so tests can hand in an in-memory
// one, and the Notifications port last, so tests can hand in a fake. Uses
// positional parameters (project convention).

export type Db = BetterSQLite3Database<typeof schema>;

type Comment = typeof comments.$inferSelect;

function lessonExists(db: Db, lessonId: number) {
  return !!db
    .select({ id: lessons.id })
    .from(lessons)
    .where(eq(lessons.id, lessonId))
    .get();
}

function getComment(db: Db, commentId: number) {
  return db.select().from(comments).where(eq(comments.id, commentId)).get();
}

export type CommentFailure = { ok: false; error: string };

export type CreateCommentResult =
  { ok: true; comment: Comment } | CommentFailure;

/**
 * Posts a Discussion Question (`parentId` null) or a Discussion Reply. A reply
 * to someone else's question sends its author the Discussion Reply
 * Notification; a failure to send it is logged and never fails the post.
 */
export async function createComment(
  db: Db,
  authorId: number,
  lessonId: number,
  parentId: number | null,
  body: string,
  now: Date,
  notifications: Notifications
): Promise<CreateCommentResult> {
  const trimmed = body.trim();
  if (trimmed.length < MIN_COMMENT_LENGTH) {
    return { ok: false, error: "Comment cannot be empty" };
  }
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    return {
      ok: false,
      error: `Comment must be ${MAX_COMMENT_LENGTH} characters or fewer`,
    };
  }

  if (!lessonExists(db, lessonId)) {
    return { ok: false, error: "Lesson not found" };
  }

  let parent: Comment | undefined;
  if (parentId !== null) {
    parent = getComment(db, parentId);
    if (!parent) {
      return { ok: false, error: "Parent comment not found" };
    }
    if (parent.lessonId !== lessonId) {
      return {
        ok: false,
        error: "Parent comment belongs to a different lesson",
      };
    }
    if (parent.parentId !== null) {
      return { ok: false, error: "Replies can only be one level deep" };
    }
  }

  const comment = db
    .insert(comments)
    .values({
      userId: authorId,
      lessonId,
      parentId,
      body: trimmed,
      createdAt: now.toISOString(),
    })
    .returning()
    .get();

  if (parent) {
    await notifyQuestionAuthor(db, parent, comment, notifications);
  } else {
    await notifyInstructor(db, comment, notifications);
  }

  return { ok: true, comment };
}

async function notifyQuestionAuthor(
  db: Db,
  question: Comment,
  reply: Comment,
  notifications: Notifications
) {
  if (question.userId === reply.userId) return;

  const recipient = findNotificationPerson(db, question.userId);
  const actor = findNotificationPerson(db, reply.userId);
  const lesson = getLessonOf(db, reply);
  if (!recipient || !actor || !lesson) return;

  await sendSafely(
    notifications,
    {
      kind: "discussion-reply",
      recipient,
      actor,
      data: {
        commentId: reply.id,
        questionId: question.id,
        lessonId: reply.lessonId,
        lessonTitle: lesson.title,
        snippet: snippetOf(reply.body),
        url: lesson.commentUrl,
      },
    },
    `discussion-reply:${reply.id}`
  );
}

/**
 * A top-level comment by anyone but the course's Instructor is a Discussion
 * Question: the Instructor gets the Discussion Question Notification.
 */
async function notifyInstructor(
  db: Db,
  question: Comment,
  notifications: Notifications
) {
  const lesson = getLessonOf(db, question);
  if (!lesson || lesson.instructorId === question.userId) return;

  const recipient = findNotificationPerson(db, lesson.instructorId);
  const actor = findNotificationPerson(db, question.userId);
  if (!recipient || !actor) return;

  await sendSafely(
    notifications,
    {
      kind: "discussion-question",
      recipient,
      actor,
      data: {
        commentId: question.id,
        lessonId: question.lessonId,
        lessonTitle: lesson.title,
        snippet: snippetOf(question.body),
        url: lesson.commentUrl,
      },
    },
    `discussion-question:${question.id}`
  );
}

/** The lesson a comment is on, its course's Instructor, and the comment's link. */
function getLessonOf(db: Db, comment: Comment) {
  const lesson = db
    .select({
      title: lessons.title,
      courseSlug: courses.slug,
      instructorId: courses.instructorId,
    })
    .from(lessons)
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .innerJoin(courses, eq(courses.id, modules.courseId))
    .where(eq(lessons.id, comment.lessonId))
    .get();
  if (!lesson) return undefined;
  return {
    ...lesson,
    commentUrl: `/courses/${lesson.courseSlug}/lessons/${comment.lessonId}#comment-${comment.id}`,
  };
}

const SNIPPET_LENGTH = 140;

/** One line of a comment body, short enough for a Notification Feed row. */
function snippetOf(body: string) {
  const line = body.replace(/\s+/g, " ").trim();
  return line.length > SNIPPET_LENGTH
    ? `${line.slice(0, SNIPPET_LENGTH - 1).trimEnd()}…`
    : line;
}

export type DeleteCommentResult =
  { ok: true; comment: Comment } | CommentFailure;

/**
 * Soft-deletes a comment and archives the Notifications it caused (the
 * Instructor's Discussion Question Notification, or the question author's
 * Discussion Reply Notification). A deleted Discussion Question keeps its
 * Discussion Replies readable, and their Notifications in place. A failure to
 * archive is logged and never fails the delete.
 */
export async function deleteComment(
  db: Db,
  commentId: number,
  userId: number,
  isStaff: boolean,
  now: Date,
  notifications: Notifications
): Promise<DeleteCommentResult> {
  const existing = getComment(db, commentId);
  if (!existing) {
    return { ok: false, error: "Comment not found" };
  }
  if (existing.userId !== userId && !isStaff) {
    return { ok: false, error: "You can only delete your own comments" };
  }
  if (existing.deletedAt !== null) {
    return { ok: true, comment: existing };
  }

  const comment = db
    .update(comments)
    .set({ deletedAt: now.toISOString() })
    .where(eq(comments.id, commentId))
    .returning()
    .get();

  await archiveForCommentSafely(notifications, commentId);

  return { ok: true, comment };
}

export type EditCommentResult = { ok: true; comment: Comment } | CommentFailure;

/**
 * Changes the body of the author's own comment. Notifications are a snapshot
 * of when they were sent, so an edit changes none of them.
 */
export function editComment(
  db: Db,
  commentId: number,
  userId: number,
  body: string,
  now: Date
): EditCommentResult {
  const trimmed = body.trim();
  if (trimmed.length < MIN_COMMENT_LENGTH) {
    return { ok: false, error: "Comment cannot be empty" };
  }
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    return {
      ok: false,
      error: `Comment must be ${MAX_COMMENT_LENGTH} characters or fewer`,
    };
  }

  const existing = getComment(db, commentId);
  if (!existing) {
    return { ok: false, error: "Comment not found" };
  }
  if (existing.deletedAt !== null) {
    return { ok: false, error: "Comment has been deleted" };
  }
  if (existing.userId !== userId) {
    return { ok: false, error: "You can only edit your own comments" };
  }

  const comment = db
    .update(comments)
    .set({ body: trimmed, editedAt: now.toISOString() })
    .where(eq(comments.id, commentId))
    .returning()
    .get();

  return { ok: true, comment };
}
