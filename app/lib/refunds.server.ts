import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "~/db";
import {
  RefundStatus,
  courses,
  enrollments,
  lessons,
  modules,
  purchases,
  refunds,
  users,
  videoWatchEvents,
} from "~/db/schema";
import {
  buildRefundOutcomeEmail,
  canResolveRefund,
  refundableAmount,
} from "~/lib/refunds";

// ─── Refund review ───
// Admins approve or decline requested Refunds by hand. Approving records the
// outcome only — no money moves here — and revokes the Learner's Enrollment.

/** Every requested Refund, oldest first, with what an Admin needs to judge it. */
export function listRequestedRefunds() {
  const rows = db
    .select({
      id: refunds.id,
      reason: refunds.reason,
      requestedAt: refunds.requestedAt,
      purchasedAt: purchases.createdAt,
      amountPaid: purchases.amountPaid,
      userId: users.id,
      learnerName: users.name,
      learnerEmail: users.email,
      courseId: courses.id,
      courseTitle: courses.title,
    })
    .from(refunds)
    .innerJoin(purchases, eq(refunds.purchaseId, purchases.id))
    .innerJoin(users, eq(purchases.userId, users.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(eq(refunds.status, RefundStatus.Requested))
    .orderBy(asc(refunds.requestedAt))
    .all();

  return rows.map(({ amountPaid, ...row }) => ({
    ...row,
    amount: refundableAmount({ amountPaid }),
    secondsWatched: getSecondsWatched(row.userId, row.courseId),
  }));
}

function getSecondsWatched(userId: number, courseId: number) {
  const furthestPerLesson = db
    .select({
      furthest: sql<number>`max(${videoWatchEvents.positionSeconds})`,
    })
    .from(videoWatchEvents)
    .innerJoin(lessons, eq(videoWatchEvents.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(
      and(eq(videoWatchEvents.userId, userId), eq(modules.courseId, courseId))
    )
    .groupBy(videoWatchEvents.lessonId)
    .all();

  return furthestPerLesson.reduce((total, row) => total + row.furthest, 0);
}

export class RefundAlreadyResolvedError extends Error {}

/**
 * Records an Admin's decision on a requested Refund. Throws
 * RefundAlreadyResolvedError if it has already been decided — the outcome is
 * final, and two Admins may click at once.
 */
export function resolveRefund(
  refundId: number,
  outcome: RefundStatus.Approved | RefundStatus.Declined,
  adminId: number
) {
  const result = db.transaction((tx) => {
    const refund = tx
      .select({
        status: refunds.status,
        amountPaid: purchases.amountPaid,
        userId: purchases.userId,
        courseId: purchases.courseId,
        learnerName: users.name,
        learnerEmail: users.email,
        courseTitle: courses.title,
      })
      .from(refunds)
      .innerJoin(purchases, eq(refunds.purchaseId, purchases.id))
      .innerJoin(users, eq(purchases.userId, users.id))
      .innerJoin(courses, eq(purchases.courseId, courses.id))
      .where(eq(refunds.id, refundId))
      .get();

    if (!refund) return null;

    if (!canResolveRefund(refund)) {
      throw new RefundAlreadyResolvedError();
    }

    const now = new Date().toISOString();
    const amount = refundableAmount(refund);
    const approved = outcome === RefundStatus.Approved;

    tx.update(refunds)
      .set({
        status: outcome,
        amountRefunded: approved ? amount : null,
        resolvedAt: now,
        resolvedByUserId: adminId,
      })
      .where(
        and(eq(refunds.id, refundId), eq(refunds.status, RefundStatus.Requested))
      )
      .run();

    if (approved) {
      tx.update(enrollments)
        .set({ revokedAt: now })
        .where(
          and(
            eq(enrollments.userId, refund.userId),
            eq(enrollments.courseId, refund.courseId),
            isNull(enrollments.revokedAt)
          )
        )
        .run();
    }

    return { ...refund, amount };
  });

  if (!result) return null;

  const email = buildRefundOutcomeEmail({
    outcome,
    learnerName: result.learnerName,
    learnerEmail: result.learnerEmail,
    courseTitle: result.courseTitle,
    amount: result.amount,
  });

  console.log(`[email] to=${email.to} subject=${email.subject}\n${email.body}`);

  return result;
}
