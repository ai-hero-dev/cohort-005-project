import { and, count, eq, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { coupons, courses, enrollments, purchases } from "~/db/schema";
import {
  enrollStudentInTransaction,
  isEnrolled,
  notifyInstructorOfEnrollment,
} from "~/lib/enrollments.server";
import { getSeatAvailability } from "~/lib/refunds.server";
import {
  sendSafely,
  findNotificationPerson,
  type Notifications,
} from "~/lib/notifications.server";
import { checkCountryLock } from "~/lib/ppp";

export type Db = BetterSQLite3Database<typeof schema>;

type Seat = typeof coupons.$inferSelect;
type Enrollment = typeof enrollments.$inferSelect;

export const SEAT_ON_HOLD =
  "This Seat can't be claimed right now. Ask the person who shared it with you.";
export const SEAT_REFUNDED =
  "This Seat is no longer available. Ask the person who shared it with you.";

export type ClaimSeatResult =
  | { ok: true; seat: Seat; enrollment: Enrollment }
  | { ok: false; error: string };

/**
 * Claims a Seat, then sends the Seat claim Notification to the Team Admin who
 * bought the Team Licence and the new Enrollment Notification to the course's
 * Instructor. A Notification failure is logged and never fails the claim.
 */
export async function claimSeat(
  db: Db,
  seatCode: string,
  studentId: number,
  studentCountry: string | null,
  now: Date,
  notifications: Notifications
): Promise<ClaimSeatResult> {
  const result = claimSeatInTransaction(
    db,
    seatCode,
    studentId,
    studentCountry,
    now
  );
  if (result.ok) {
    await notifyTeamAdmin(db, result.seat, notifications);
    await notifyInstructorOfEnrollment(db, result.enrollment, notifications);
  }
  return result;
}

function claimSeatInTransaction(
  db: Db,
  seatCode: string,
  studentId: number,
  studentCountry: string | null,
  now: Date
): ClaimSeatResult {
  return db.transaction((tx): ClaimSeatResult => {
    const seat = tx
      .select()
      .from(coupons)
      .where(eq(coupons.code, seatCode))
      .get();
    if (!seat) {
      return { ok: false, error: "Seat not found" };
    }

    if (seat.redeemedByUserId !== null) {
      return { ok: false, error: "This Seat has already been claimed" };
    }

    const availability = getSeatAvailability(tx, seat);
    if (availability === "on_hold") {
      return { ok: false, error: SEAT_ON_HOLD };
    }
    if (availability === "refunded") {
      return { ok: false, error: SEAT_REFUNDED };
    }

    if (isEnrolled(tx, studentId, seat.courseId)) {
      return { ok: false, error: "You are already enrolled in this course" };
    }

    if (isSeatCountryLocked(tx, seat, studentCountry)) {
      return {
        ok: false,
        error:
          "This Seat can only be claimed from the same country as the Team Licence was bought in",
      };
    }

    const enrolled = enrollStudentInTransaction(
      tx,
      studentId,
      seat.courseId,
      now
    );
    if (!enrolled.ok) return enrolled;

    const claimed = tx
      .update(coupons)
      .set({ redeemedByUserId: studentId, redeemedAt: now.toISOString() })
      .where(eq(coupons.id, seat.id))
      .returning()
      .get();

    return { ok: true, seat: claimed, enrollment: enrolled.enrollment };
  });
}

/**
 * Whether the Country Lock stops this Seat being claimed from the Student's
 * country. Only a Team Licence bought at a Purchasing-Power Price is locked.
 */
export function isSeatCountryLocked(
  db: Db,
  seat: Seat,
  studentCountry: string | null
): boolean {
  const purchase = db
    .select({ country: purchases.country })
    .from(purchases)
    .where(eq(purchases.id, seat.purchaseId))
    .get();
  const course = db
    .select({ price: courses.price, pppEnabled: courses.pppEnabled })
    .from(courses)
    .where(eq(courses.id, seat.courseId))
    .get();
  if (!purchase || !course) return false;
  return checkCountryLock(
    course.price,
    course.pppEnabled,
    purchase.country,
    studentCountry
  ).blocked;
}

async function notifyTeamAdmin(
  db: Db,
  seat: Seat,
  notifications: Notifications
) {
  if (seat.redeemedByUserId === null) return;

  const purchase = db
    .select({ userId: purchases.userId })
    .from(purchases)
    .where(eq(purchases.id, seat.purchaseId))
    .get();
  const course = db
    .select({ title: courses.title })
    .from(courses)
    .where(eq(courses.id, seat.courseId))
    .get();
  const recipient = purchase && findNotificationPerson(db, purchase.userId);
  const actor = findNotificationPerson(db, seat.redeemedByUserId);
  if (!recipient || !actor || !course) return;

  await sendSafely(
    notifications,
    {
      kind: "seat-claimed",
      recipient,
      actor,
      data: {
        seatId: seat.id,
        courseId: seat.courseId,
        courseTitle: course.title,
        seatsLeft: countSeatsLeft(db, seat.purchaseId),
        url: "/team",
      },
    },
    `seat-claimed:${seat.id}`
  );
}

/** Seats on a Team Licence nobody has claimed and that weren't refunded. */
function countSeatsLeft(db: Db, purchaseId: number) {
  const row = db
    .select({ seatsLeft: count() })
    .from(coupons)
    .where(
      and(
        eq(coupons.purchaseId, purchaseId),
        isNull(coupons.redeemedByUserId),
        isNull(coupons.refundedAt)
      )
    )
    .get();
  return row?.seatsLeft ?? 0;
}
