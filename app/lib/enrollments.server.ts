import { eq, and, isNull, inArray } from "drizzle-orm";
import { db } from "~/db";
import { enrollments, lessonProgress } from "~/db/schema";

// ─── Live Enrollments ───
// A Learner may hold several Enrollments on one Course (a Refund revokes one,
// a re-purchase creates another), but at most one is live — not revoked.
// Every "is this Learner enrolled?" check goes through here. See docs/adr/0001.

/** Only Enrollments that haven't been revoked by a Refund. */
export const isLiveEnrollment = isNull(enrollments.revokedAt);

/** The Learner's live Enrollment on this Course, if they have one. */
export function findLiveEnrollment(userId: number, courseId: number) {
  return db
    .select()
    .from(enrollments)
    .where(
      and(
        eq(enrollments.userId, userId),
        eq(enrollments.courseId, courseId),
        isLiveEnrollment
      )
    )
    .get();
}

/**
 * Restricts lessonProgress rows to those made under a live Enrollment, so a
 * Learner who re-buys a Course starts fresh.
 */
export function isLiveProgress() {
  return inArray(
    lessonProgress.enrollmentId,
    db.select({ id: enrollments.id }).from(enrollments).where(isLiveEnrollment)
  );
}
