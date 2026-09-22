import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { sendEmail } from "~/lib/mailer.server";
import { db } from "~/db";
import {
  NotificationCategory,
  RefundStatus,
  courses,
  enrollments,
  lessons,
  modules,
  notifications,
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
import { formatPrice } from "~/lib/utils";

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
    .where(eq(refunds.status, RefundStatus.Open))
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

// ─── In-app to external bridge ───
// The notification row is the thing the bell reads. Ably is the bridge that
// carries the same event out of the app, for a learner who is not looking at
// it. Without ABLY_API_KEY there is no bridge — the in-app half still works,
// and nothing here fails.
async function publishNotificationToAbly(input: {
  userId: number;
  category: NotificationCategory;
  title: string;
  body: string;
}) {
  const apiKey = process.env.ABLY_API_KEY;
  if (!apiKey) return;

  try {
    const response = await fetch(
      `https://rest.ably.io/channels/notifications:${input.userId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(apiKey).toString("base64")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: input.category,
          data: { title: input.title, body: input.body },
        }),
      }
    );

    if (!response.ok) {
      console.error(
        `[ably] publish failed with ${response.status} ${response.statusText}`
      );
    }
  } catch (error) {
    // A vendor being unreachable must not fail a refund decision. The row is
    // already written, and the bell reads the row.
    console.error("[ably] could not publish notification", error);
  }
}

/**
 * Records an Admin's decision on a requested Refund. Throws
 * RefundAlreadyResolvedError if it has already been decided — the outcome is
 * final, and two Admins may click at once.
 */
export async function resolveRefund(
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
        and(eq(refunds.id, refundId), eq(refunds.status, RefundStatus.Open))
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

    const notice = approved
      ? {
          title: "Your refund was approved",
          body: `${formatPrice(amount)} is on its way back to you for "${refund.courseTitle}".`,
        }
      : {
          title: "Your refund was declined",
          body: `We could not refund "${refund.courseTitle}". Reply to your receipt if you think that is wrong.`,
        };

    tx.insert(notifications)
      .values({
        userId: refund.userId,
        category: NotificationCategory.Refund,
        ...notice,
        linkUrl: "/settings",
      })
      .run();

    return { ...refund, amount, notice };
  });

  if (!result) return null;

  const email = buildRefundOutcomeEmail({
    outcome,
    learnerName: result.learnerName,
    learnerEmail: result.learnerEmail,
    courseTitle: result.courseTitle,
    amount: result.amount,
  });

  await sendEmail(email);

  await publishNotificationToAbly({
    userId: result.userId,
    category: NotificationCategory.Refund,
    ...result.notice,
  });

  return result;
}
