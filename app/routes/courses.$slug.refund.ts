import { data, redirect } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/courses.$slug.refund";
import { getCurrentUserId } from "~/lib/session";
import { db } from "~/db";
import {
  courses,
  coupons,
  lessons,
  modules,
  notifications,
  purchases,
  refunds,
  users,
  videoWatchEvents,
  lessonProgress,
  LessonProgressStatus,
  NotificationCategory,
  RefundStatus,
} from "~/db/schema";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { parseFormData, parseParams } from "~/lib/validation";
import { isLiveProgress } from "~/lib/enrollments.server";
import { systemClock } from "~/modules/clock";
import { decideRefund, type RefundRefusal } from "~/modules/refund-policy";
import { formatPrice } from "~/lib/utils";
import { sendEmail } from "~/lib/mailer.server";

const refundParamsSchema = z.object({
  slug: z.string().min(1),
});

const refundActionSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "Tell us a little more about why you want a refund.")
    .max(1000, "Please keep your reason under 1000 characters."),
});

function getCourseBySlug(slug: string) {
  return db.select().from(courses).where(eq(courses.slug, slug)).get();
}

function getLatestPurchase(userId: number, courseId: number) {
  return db
    .select()
    .from(purchases)
    .where(and(eq(purchases.userId, userId), eq(purchases.courseId, courseId)))
    .orderBy(sql`${purchases.createdAt} desc`)
    .get();
}

function getLessonIdsForCourse(courseId: number): number[] {
  const rows = db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .all();

  return rows.map((row) => row.id);
}

function getCompletedLessonCount(userId: number, lessonIds: number[]): number {
  if (lessonIds.length === 0) return 0;

  const row = db
    .select({ completed: sql<number>`count(*)` })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        isLiveProgress(),
        eq(lessonProgress.status, LessonProgressStatus.Completed),
        inArray(lessonProgress.lessonId, lessonIds)
      )
    )
    .get();

  return row?.completed ?? 0;
}

function getWatchedSeconds(userId: number, lessonIds: number[]): number {
  if (lessonIds.length === 0) return 0;

  const furthestPerLesson = db
    .select({
      furthest: sql<number>`max(${videoWatchEvents.positionSeconds})`,
    })
    .from(videoWatchEvents)
    .where(
      and(
        eq(videoWatchEvents.userId, userId),
        inArray(videoWatchEvents.lessonId, lessonIds)
      )
    )
    .groupBy(videoWatchEvents.lessonId)
    .all();

  return furthestPerLesson.reduce((total, row) => total + row.furthest, 0);
}

// Which condition refused decides the status. The policy says why; the route
// says how that reaches the browser.
const REFUSAL_STATUS: Record<RefundRefusal, number> = {
  "already-requested": 409,
  "already-refunded": 409,
  "window-closed": 403,
  "too-much-completed": 403,
  "too-much-watched": 403,
  "seat-claimed": 403,
};

function getRefundsForPurchase(purchaseId: number) {
  return db
    .select({ status: refunds.status })
    .from(refunds)
    .where(eq(refunds.purchaseId, purchaseId))
    .all();
}

/** The confirmation the learner gets in their inbox. */
function buildRefundEmail(input: {
  learnerName: string;
  learnerEmail: string;
  courseTitle: string;
  amount: number;
}) {
  return {
    to: input.learnerEmail,
    subject: `Refund requested — ${input.courseTitle}`,
    body: [
      `Hi ${input.learnerName},`,
      "",
      `We have your Refund request for "${input.courseTitle}".`,
      `The Refund is for ${formatPrice(input.amount)}, the amount you paid.`,
      "",
      "Our team reviews every Refund by hand. You do not need to do anything else — we will email you again when it is done.",
      "",
      "— The Cadence team",
    ].join("\n"),
  };
}

// ─── In-app to external bridge ───
// The notification row is the thing the bell reads. Ably is the bridge that
// carries the same event out of the app, for staff who are not looking at it.
// Without ABLY_API_KEY there is no bridge — the in-app half still works, and
// nothing here fails.
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
    // A vendor being unreachable must not fail a refund request. The row is
    // already written, and the bell reads the row.
    console.error("[ably] could not publish notification", error);
  }
}

export async function action({ params, request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("You must be logged in to ask for a refund.", { status: 401 });
  }

  const { slug } = parseParams(params, refundParamsSchema);
  const course = getCourseBySlug(slug);

  if (!course) {
    throw data("Course not found", { status: 404 });
  }

  const learner = db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .get();

  if (!learner) {
    throw data("User not found", { status: 404 });
  }

  const purchase = getLatestPurchase(currentUserId, course.id);

  if (!purchase) {
    throw data("You have not bought this course.", { status: 403 });
  }

  // The refund policy is four conditions, and it lives in one module. This
  // action's job is to gather the facts, hand them over, and turn a refusal
  // into a response.
  const courseLessonIds = getLessonIdsForCourse(course.id);

  const claimedSeat = db
    .select({ id: coupons.id })
    .from(coupons)
    .where(
      and(eq(coupons.purchaseId, purchase.id), isNotNull(coupons.redeemedAt))
    )
    .get();

  const decision = decideRefund(
    {
      purchasedAt: purchase.createdAt,
      amountPaidCents: purchase.amountPaid,
      lessonCount: courseLessonIds.length,
      completedLessonCount: getCompletedLessonCount(
        currentUserId,
        courseLessonIds
      ),
      watchedSeconds: getWatchedSeconds(currentUserId, courseLessonIds),
      hasClaimedSeat: claimedSeat !== undefined,
      existingRefunds: getRefundsForPurchase(purchase.id),
    },
    systemClock
  );

  if (!decision.eligible) {
    throw data(decision.message, {
      status: REFUSAL_STATUS[decision.refusedBy],
    });
  }

  const formData = await request.formData();
  const parsed = parseFormData(formData, refundActionSchema);

  if (!parsed.success) {
    return data({ errors: parsed.errors }, { status: 400 });
  }

  db.insert(refunds)
    .values({
      purchaseId: purchase.id,
      status: RefundStatus.Requested,
      reason: parsed.data.reason,
    })
    .returning()
    .get();

  // Only an Admin resolves a Refund, but the course's own instructor hears
  // about every request, so it lands in their bell as well.
  db.insert(notifications)
    .values({
      userId: course.instructorId,
      category: NotificationCategory.Refund,
      title: "A learner asked for a refund",
      body: `${learner.name} asked for a refund on "${course.title}".`,
      linkUrl: "/admin/refunds",
    })
    .run();

  await publishNotificationToAbly({
    userId: course.instructorId,
    category: NotificationCategory.Refund,
    title: "A learner asked for a refund",
    body: `${learner.name} asked for a refund on "${course.title}".`,
  });

  const email = buildRefundEmail({
    learnerName: learner.name,
    learnerEmail: learner.email,
    courseTitle: course.title,
    amount: decision.refundableCents,
  });

  await sendEmail(email);

  return redirect("/settings");
}
