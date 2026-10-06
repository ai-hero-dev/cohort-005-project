import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { alias } from "drizzle-orm/sqlite-core";
import * as schema from "~/db/schema";
import {
  coupons,
  courses,
  enrollments,
  lessonProgress,
  lessons,
  modules,
  purchases,
  refunds,
  users,
  videoWatchEvents,
  LessonProgressStatus,
  RefundStatus,
  UserRole,
} from "~/db/schema";
import { formatPrice } from "~/lib/utils";
import {
  sendSafely,
  toNotificationPerson,
  type Notifications,
} from "~/lib/notifications.server";
import {
  REFUND_COMPLETION_LIMIT,
  REFUND_WATCH_LIMIT_SECONDS,
  REFUND_WINDOW_DAYS,
  type RuleBreak,
} from "~/lib/refund-rules";

// ─── Refunds ───
// Everything about Refund Requests: whether a Purchase may be refunded, raising
// a Refund Request, and a Platform Admin deciding one. See GLOSSARY.md for the
// language and docs/adr/0001–0004 for why it works the way it does.
//
// Every function takes the database first, so tests can hand in an in-memory
// one. Uses positional parameters (project convention).

export type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Queryable = Db | Tx;

type Purchase = typeof purchases.$inferSelect;
type Seat = typeof coupons.$inferSelect;

// ─── Calendar days ───

// The fourteen-day window is counted in whole days, not hours — someone who
// buys at 23:00 should still get the whole of their fourteenth day.
export function calendarDay(when: Date): string {
  const month = String(when.getMonth() + 1).padStart(2, "0");
  const day = String(when.getDate()).padStart(2, "0");
  return `${when.getFullYear()}-${month}-${day}`;
}

export function lastDayOfWindow(purchasedAtIso: string): string {
  const deadline = new Date(purchasedAtIso);
  deadline.setDate(deadline.getDate() + REFUND_WINDOW_DAYS);
  return calendarDay(deadline);
}

function isWithinWindow(purchasedAtIso: string, on: Date): boolean {
  const day = calendarDay(on);
  return (
    day >= calendarDay(new Date(purchasedAtIso)) &&
    day <= lastDayOfWindow(purchasedAtIso)
  );
}

// ─── Purchases and Seats ───

function getPurchase(db: Queryable, purchaseId: number) {
  return db.select().from(purchases).where(eq(purchases.id, purchaseId)).get();
}

function getSeats(db: Queryable, purchaseId: number): Seat[] {
  return db
    .select()
    .from(coupons)
    .where(eq(coupons.purchaseId, purchaseId))
    .all();
}

function isClaimed(seat: Seat) {
  return seat.redeemedAt !== null;
}

// There is no column saying which kind a Purchase is: a Team Licence is the
// Purchase that granted Seats, and every Team Licence grants at least one.
export type PurchaseKind = "individual_purchase" | "team_licence";

function kindOf(seats: Seat[]): PurchaseKind {
  return seats.length > 0 ? "team_licence" : "individual_purchase";
}

function getRefundRequestWithStatus(
  db: Queryable,
  purchaseId: number,
  status: RefundStatus
) {
  return db
    .select()
    .from(refunds)
    .where(and(eq(refunds.purchaseId, purchaseId), eq(refunds.status, status)))
    .get();
}

export type SeatAvailability = "available" | "claimed" | "on_hold" | "refunded";

/**
 * Whether a Seat can be claimed right now. A Team Licence's Unclaimed Seats are
 * on hold while it has an Open Refund Request, and can never be claimed once
 * that request is approved.
 */
export function getSeatAvailability(
  db: Queryable,
  seat: Seat
): SeatAvailability {
  if (isClaimed(seat)) return "claimed";
  if (seat.refundedAt !== null) return "refunded";
  if (getRefundRequestWithStatus(db, seat.purchaseId, RefundStatus.Open)) {
    return "on_hold";
  }
  return "available";
}

// ─── Figures and rules ───

function getLessonIds(db: Queryable, courseId: number): number[] {
  return db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .all()
    .map((row) => row.id);
}

function getCompletedLessonCount(
  db: Queryable,
  userId: number,
  lessonIds: number[]
) {
  if (lessonIds.length === 0) return 0;

  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.status, LessonProgressStatus.Completed),
        inArray(lessonProgress.lessonId, lessonIds)
      )
    )
    .get();

  return result?.count ?? 0;
}

function getSecondsWatched(db: Queryable, userId: number, lessonIds: number[]) {
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

/**
 * How far the buyer has got with what they bought. For an Individual Purchase
 * that is their own progress. A Team Licence gives its buyer nothing to watch,
 * so for one it is how many of its Seats have been claimed.
 */
export type RefundFigures =
  | {
      kind: "individual_purchase";
      lessonsCompleted: number;
      lessonCount: number;
      secondsWatched: number;
    }
  | {
      kind: "team_licence";
      seatCount: number;
      claimedSeatCount: number;
    };

function getRefundFigures(db: Queryable, purchase: Purchase): RefundFigures {
  const seats = getSeats(db, purchase.id);

  if (kindOf(seats) === "team_licence") {
    return {
      kind: "team_licence",
      seatCount: seats.length,
      claimedSeatCount: seats.filter(isClaimed).length,
    };
  }

  const lessonIds = getLessonIds(db, purchase.courseId);
  return {
    kind: "individual_purchase",
    lessonsCompleted: getCompletedLessonCount(db, purchase.userId, lessonIds),
    lessonCount: lessonIds.length,
    secondsWatched: getSecondsWatched(db, purchase.userId, lessonIds),
  };
}

/** What the buyer is told when they can't raise a Refund Request. */
const RULE_BREAK_ERRORS: Record<RuleBreak, string> = {
  window_closed: `The ${REFUND_WINDOW_DAYS}-day window has closed.`,
  watched_too_much:
    "You have watched too much of this course to get a refund.",
  completed_too_much:
    "You have completed too much of this course to request a refund.",
  seat_claimed: "A Team Licence with a claimed Seat cannot be refunded.",
};

/**
 * The eligibility rules a Purchase breaks. `windowCheckedOn` is the day the
 * window is judged against: today when a buyer asks, and the day it was raised
 * when a Platform Admin looks at a Refund Request.
 */
function findRuleBreaks(
  purchase: Purchase,
  figures: RefundFigures,
  windowCheckedOn: Date
): RuleBreak[] {
  const breaks: RuleBreak[] = [];

  if (!isWithinWindow(purchase.createdAt, windowCheckedOn)) {
    breaks.push("window_closed");
  }

  if (figures.kind === "team_licence") {
    if (figures.claimedSeatCount > 0) breaks.push("seat_claimed");
    return breaks;
  }

  if (figures.secondsWatched >= REFUND_WATCH_LIMIT_SECONDS) {
    breaks.push("watched_too_much");
  }

  if (
    figures.lessonCount > 0 &&
    figures.lessonsCompleted / figures.lessonCount >= REFUND_COMPLETION_LIMIT
  ) {
    breaks.push("completed_too_much");
  }

  return breaks;
}

// ─── Raising a Refund Request ───

export type Failure = { ok: false; status: 400 | 403 | 404 | 409; error: string };

type RefundCheck = { ok: true; purchase: Purchase } | Failure;

/**
 * Whether this buyer may raise a Refund Request on this Purchase today. Only
 * the person who paid may, and only one Refund Request can be open at once.
 */
export function checkRefundRequest(
  db: Queryable,
  purchaseId: number,
  buyerId: number,
  now: Date
): RefundCheck {
  const purchase = getPurchase(db, purchaseId);

  if (!purchase || purchase.userId !== buyerId) {
    return { ok: false, status: 404, error: "Purchase not found." };
  }

  if (getRefundRequestWithStatus(db, purchase.id, RefundStatus.Open)) {
    return {
      ok: false,
      status: 409,
      error: "You already have an open refund request on this purchase.",
    };
  }

  if (getRefundRequestWithStatus(db, purchase.id, RefundStatus.Approved)) {
    return {
      ok: false,
      status: 409,
      error: "This purchase has already been refunded.",
    };
  }

  const [firstBreak] = findRuleBreaks(
    purchase,
    getRefundFigures(db, purchase),
    now
  );

  if (firstBreak) {
    return { ok: false, status: 403, error: RULE_BREAK_ERRORS[firstBreak] };
  }

  return { ok: true, purchase };
}

export type RefundOffer = {
  purchaseId: number;
  amount: number;
  lastDayInWindow: string;
};

/**
 * What the course page offers a student who wants their money back: their
 * newest Individual Purchase of the course, if it can be refunded. Team
 * Licences are refunded from the team page instead.
 */
export function getRefundOffer(
  db: Queryable,
  buyerId: number,
  courseId: number,
  now: Date
): RefundOffer | null {
  const newestFirst = db
    .select()
    .from(purchases)
    .where(and(eq(purchases.userId, buyerId), eq(purchases.courseId, courseId)))
    .orderBy(desc(purchases.createdAt), desc(purchases.id))
    .all();

  const individualPurchase = newestFirst.find(
    (purchase) => kindOf(getSeats(db, purchase.id)) === "individual_purchase"
  );

  if (!individualPurchase) return null;

  const check = checkRefundRequest(db, individualPurchase.id, buyerId, now);
  if (!check.ok) return null;

  return {
    purchaseId: individualPurchase.id,
    amount: individualPurchase.amountPaid,
    lastDayInWindow: lastDayOfWindow(individualPurchase.createdAt),
  };
}

export type Email = { to: string; subject: string; body: string };

export type RaiseResult =
  | { ok: true; refundRequestId: number; kind: PurchaseKind; email: Email }
  | Failure;

export async function raiseRefundRequest(
  db: Db,
  purchaseId: number,
  buyerId: number,
  reason: string,
  now: Date,
  notifications: Notifications
): Promise<RaiseResult> {
  const check = checkRefundRequest(db, purchaseId, buyerId, now);
  if (!check.ok) return check;

  const { purchase } = check;
  const buyer = db.select().from(users).where(eq(users.id, buyerId)).get();
  const course = db
    .select()
    .from(courses)
    .where(eq(courses.id, purchase.courseId))
    .get();

  if (!buyer || !course) {
    return { ok: false, status: 404, error: "Purchase not found." };
  }

  const refundRequest = db
    .insert(refunds)
    .values({
      purchaseId: purchase.id,
      status: RefundStatus.Open,
      reason,
      requestedAt: now.toISOString(),
    })
    .returning()
    .get();

  await sendSafely(
    notifications,
    {
      kind: "refund-requested",
      recipient: toNotificationPerson(buyer),
      data: {
        refundRequestId: refundRequest.id,
        courseTitle: course.title,
        amount: formatPrice(purchase.amountPaid),
      },
    },
    `refund-requested:${refundRequest.id}`
  );

  const platformAdmins = db
    .select()
    .from(users)
    .where(eq(users.role, UserRole.Admin))
    .all();
  for (const platformAdmin of platformAdmins) {
    await sendSafely(
      notifications,
      {
        kind: "refund-request-open",
        recipient: toNotificationPerson(platformAdmin),
        actor: toNotificationPerson(buyer),
        data: {
          refundRequestId: refundRequest.id,
          buyerName: buyer.name,
          courseTitle: course.title,
          amount: formatPrice(purchase.amountPaid),
          reason,
          url: "/admin/refunds",
        },
      },
      `refund-request-open:${refundRequest.id}`
    );
  }

  return {
    ok: true,
    refundRequestId: refundRequest.id,
    kind: kindOf(getSeats(db, purchase.id)),
    email: {
      to: buyer.email,
      subject: `Refund requested — ${course.title}`,
      body: [
        `Hi ${buyer.name},`,
        "",
        `We have your refund request for "${course.title}".`,
        `The refund is for ${formatPrice(purchase.amountPaid)}, the amount you paid.`,
        "",
        "Our team reviews every refund request by hand. You do not need to do anything else — we will email you again when it is done.",
        "",
        "— The Cadence team",
      ].join("\n"),
    },
  };
}

// ─── Listing Refund Requests ───

const deciders = alias(users, "deciders");

function selectRefundRequests(db: Queryable) {
  return db
    .select({
      id: refunds.id,
      status: refunds.status,
      reason: refunds.reason,
      decisionNote: refunds.decisionNote,
      requestedAt: refunds.requestedAt,
      resolvedAt: refunds.resolvedAt,
      decidedByName: deciders.name,
      purchase: purchases,
      courseTitle: courses.title,
      courseSlug: courses.slug,
      buyerName: users.name,
      buyerEmail: users.email,
    })
    .from(refunds)
    .innerJoin(purchases, eq(refunds.purchaseId, purchases.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .innerJoin(users, eq(purchases.userId, users.id))
    .leftJoin(deciders, eq(refunds.resolvedByUserId, deciders.id));
}

export type RefundRequestForReview = {
  id: number;
  status: RefundStatus;
  reason: string;
  decisionNote: string | null;
  requestedAt: string;
  resolvedAt: string | null;
  decidedByName: string | null;
  buyerName: string;
  buyerEmail: string;
  courseTitle: string;
  courseSlug: string;
  amountPaid: number;
  purchasedAt: string;
  daysSincePurchase: number;
  figures: RefundFigures;
  ruleBreaks: RuleBreak[];
  canApprove: boolean;
};

/**
 * The Refund Requests a Platform Admin reviews, oldest first. The figures are
 * live, not a snapshot from when the request was raised: the buyer keeps the
 * course while it is open, so what matters is how far they have got now.
 */
export function listRefundRequestsForReview(
  db: Queryable,
  status: RefundStatus,
  now: Date
): RefundRequestForReview[] {
  const rows = selectRefundRequests(db)
    .where(eq(refunds.status, status))
    .orderBy(asc(refunds.requestedAt), asc(refunds.id))
    .all();

  return rows.map((row) => {
    const figures = getRefundFigures(db, row.purchase);
    const ruleBreaks = findRuleBreaks(
      row.purchase,
      figures,
      new Date(row.requestedAt)
    );
    const msSincePurchase =
      now.getTime() - new Date(row.purchase.createdAt).getTime();

    return {
      id: row.id,
      status: row.status,
      reason: row.reason,
      decisionNote: row.decisionNote,
      requestedAt: row.requestedAt,
      resolvedAt: row.resolvedAt,
      decidedByName: row.decidedByName,
      buyerName: row.buyerName,
      buyerEmail: row.buyerEmail,
      courseTitle: row.courseTitle,
      courseSlug: row.courseSlug,
      amountPaid: row.purchase.amountPaid,
      purchasedAt: row.purchase.createdAt,
      daysSincePurchase: Math.max(0, Math.floor(msSincePurchase / 86_400_000)),
      figures,
      ruleBreaks,
      // A Claimed Seat belongs to another student, so the only way out of
      // that request is a decline. See docs/adr/0003.
      canApprove:
        row.status === RefundStatus.Open && !ruleBreaks.includes("seat_claimed"),
    };
  });
}

/** A buyer's own Refund Requests, newest first, for their Settings page. */
export function listRefundRequestsForBuyer(db: Queryable, buyerId: number) {
  return selectRefundRequests(db)
    .where(eq(purchases.userId, buyerId))
    .orderBy(desc(refunds.requestedAt), desc(refunds.id))
    .all()
    .map((row) => ({
      id: row.id,
      status: row.status,
      reason: row.reason,
      decisionNote: row.decisionNote,
      requestedAt: row.requestedAt,
      resolvedAt: row.resolvedAt,
      courseTitle: row.courseTitle,
      courseSlug: row.courseSlug,
      amountPaid: row.purchase.amountPaid,
    }));
}

/** A Team Admin's Team Licences, with what the team page needs to refund one. */
export function listTeamLicences(db: Queryable, buyerId: number, now: Date) {
  const bought = db
    .select({
      purchase: purchases,
      courseTitle: courses.title,
      courseSlug: courses.slug,
    })
    .from(purchases)
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(eq(purchases.userId, buyerId))
    .orderBy(desc(purchases.createdAt), desc(purchases.id))
    .all();

  return bought.flatMap(({ purchase, courseTitle, courseSlug }) => {
    const seats = getSeats(db, purchase.id);
    if (kindOf(seats) !== "team_licence") return [];

    const latestRefundRequest = db
      .select({ status: refunds.status, decisionNote: refunds.decisionNote })
      .from(refunds)
      .where(eq(refunds.purchaseId, purchase.id))
      .orderBy(desc(refunds.requestedAt), desc(refunds.id))
      .get();

    return [
      {
        purchaseId: purchase.id,
        courseTitle,
        courseSlug,
        amountPaid: purchase.amountPaid,
        purchasedAt: purchase.createdAt,
        seatCount: seats.length,
        claimedSeatCount: seats.filter(isClaimed).length,
        latestRefundRequest: latestRefundRequest ?? null,
        canRequestRefund: checkRefundRequest(db, purchase.id, buyerId, now).ok,
        lastDayInWindow: lastDayOfWindow(purchase.createdAt),
      },
    ];
  });
}

// ─── Deciding a Refund Request ───

export type DecisionResult = { ok: true; email: Email } | Failure;

function findOpenRefundRequest(
  tx: Queryable,
  refundRequestId: number
): { ok: true; purchase: Purchase } | Failure {
  const refundRequest = tx
    .select()
    .from(refunds)
    .where(eq(refunds.id, refundRequestId))
    .get();

  if (!refundRequest) {
    return { ok: false, status: 404, error: "Refund request not found." };
  }

  // The first decision wins. A second Platform Admin deciding the same
  // request lands here and is told what already happened.
  if (refundRequest.status !== RefundStatus.Open) {
    return {
      ok: false,
      status: 409,
      error: `This refund request was already ${refundRequest.status}.`,
    };
  }

  const purchase = getPurchase(tx, refundRequest.purchaseId);
  if (!purchase) {
    return { ok: false, status: 404, error: "Purchase not found." };
  }

  return { ok: true, purchase };
}

/**
 * Approves an Open Refund Request and ends what its Purchase granted.
 *
 * - An Individual Purchase: the buyer loses their Enrollment, unless
 *   they also hold a Claimed Seat for the course (docs/adr/0004). Their progress stays
 *   (docs/adr/0001).
 * - A Team Licence: its Unclaimed Seats can never be claimed. Refused if any
 *   Seat has been claimed (docs/adr/0003).
 */
export async function approveRefundRequest(
  db: Db,
  refundRequestId: number,
  platformAdminId: number,
  note: string | null,
  now: Date,
  notifications: Notifications
): Promise<DecisionResult> {
  const result = db.transaction((tx): DecisionResult => {
    const found = findOpenRefundRequest(tx, refundRequestId);
    if (!found.ok) return found;

    const { purchase } = found;
    const seats = getSeats(tx, purchase.id);

    if (kindOf(seats) === "team_licence") {
      if (seats.some(isClaimed)) {
        return {
          ok: false,
          status: 409,
          error:
            "A Seat on this Team Licence has been claimed, so this refund request can only be declined.",
        };
      }

      tx.update(coupons)
        .set({ refundedAt: now.toISOString() })
        .where(
          and(eq(coupons.purchaseId, purchase.id), isNull(coupons.redeemedAt))
        )
        .run();
    } else {
      const claimedSeat = tx
        .select({ id: coupons.id })
        .from(coupons)
        .where(
          and(
            eq(coupons.redeemedByUserId, purchase.userId),
            eq(coupons.courseId, purchase.courseId),
            isNotNull(coupons.redeemedAt)
          )
        )
        .get();

      if (!claimedSeat) {
        tx.delete(enrollments)
          .where(
            and(
              eq(enrollments.userId, purchase.userId),
              eq(enrollments.courseId, purchase.courseId)
            )
          )
          .run();
      }
    }

    tx.update(refunds)
      .set({
        status: RefundStatus.Approved,
        amountRefunded: purchase.amountPaid,
        decisionNote: note,
        resolvedAt: now.toISOString(),
        resolvedByUserId: platformAdminId,
      })
      .where(eq(refunds.id, refundRequestId))
      .run();

    return {
      ok: true,
      email: buildDecisionEmail(tx, purchase, RefundStatus.Approved, note),
    };
  });

  if (result.ok) await notifyDecision(db, refundRequestId, notifications);
  return result;
}

/**
 * Declines an Open Refund Request. Nothing the Purchase granted is lost, and
 * the buyer may raise a new Refund Request. The note is required: it is how
 * the buyer learns whether another request is worth raising.
 */
export async function declineRefundRequest(
  db: Db,
  refundRequestId: number,
  platformAdminId: number,
  note: string,
  now: Date,
  notifications: Notifications
): Promise<DecisionResult> {
  const trimmedNote = note.trim();

  if (trimmedNote.length === 0) {
    return {
      ok: false,
      status: 400,
      error: "Write the buyer a note saying why it was declined.",
    };
  }

  const result = db.transaction((tx): DecisionResult => {
    const found = findOpenRefundRequest(tx, refundRequestId);
    if (!found.ok) return found;

    tx.update(refunds)
      .set({
        status: RefundStatus.Declined,
        decisionNote: trimmedNote,
        resolvedAt: now.toISOString(),
        resolvedByUserId: platformAdminId,
      })
      .where(eq(refunds.id, refundRequestId))
      .run();

    return {
      ok: true,
      email: buildDecisionEmail(
        tx,
        found.purchase,
        RefundStatus.Declined,
        trimmedNote
      ),
    };
  });

  if (result.ok) await notifyDecision(db, refundRequestId, notifications);
  return result;
}

/** The email the buyer gets once their Refund Request is decided. */
function buildDecisionEmail(
  db: Queryable,
  purchase: Purchase,
  decision: RefundStatus.Approved | RefundStatus.Declined,
  note: string | null
): Email {
  const buyer = db
    .select()
    .from(users)
    .where(eq(users.id, purchase.userId))
    .get();
  const course = db
    .select()
    .from(courses)
    .where(eq(courses.id, purchase.courseId))
    .get();

  const courseTitle = course?.title ?? "your course";
  const noteLines = note ? ["", note] : [];

  const middle =
    decision === RefundStatus.Approved
      ? [
          `We have approved your refund request for "${courseTitle}".`,
          `${formatPrice(purchase.amountPaid)}, the full amount you paid, is on its way back to you.`,
          ...noteLines,
        ]
      : [
          `We have looked at your refund request for "${courseTitle}" and decided not to refund it.`,
          ...noteLines,
          "",
          "You still have everything you bought. If something changes, you can raise a new refund request.",
        ];

  return {
    to: buyer?.email ?? "",
    subject: `Refund ${decision} — ${courseTitle}`,
    body: [
      `Hi ${buyer?.name ?? "there"},`,
      "",
      ...middle,
      "",
      "— The Cadence team",
    ].join("\n"),
  };
}

// ─── Notifications ───

/**
 * Tells the buyer how their Refund Request was decided. Reads the decision
 * back after it has committed.
 */
async function notifyDecision(
  db: Db,
  refundRequestId: number,
  notifications: Notifications
) {
  const refundRequest = db
    .select()
    .from(refunds)
    .where(eq(refunds.id, refundRequestId))
    .get();
  if (!refundRequest || refundRequest.status === RefundStatus.Open) return;

  const purchase = getPurchase(db, refundRequest.purchaseId);
  if (!purchase) return;
  const buyer = db.select().from(users).where(eq(users.id, purchase.userId)).get();
  const course = db
    .select()
    .from(courses)
    .where(eq(courses.id, purchase.courseId))
    .get();
  const decider = refundRequest.resolvedByUserId
    ? db
        .select()
        .from(users)
        .where(eq(users.id, refundRequest.resolvedByUserId))
        .get()
    : undefined;
  if (!buyer || !course) return;

  const purchaseKind = kindOf(getSeats(db, purchase.id));
  const data = {
    refundRequestId,
    courseTitle: course.title,
    purchaseKind,
    amount: formatPrice(purchase.amountPaid),
    url: purchaseKind === "team_licence" ? "/team" : "/settings",
  };
  const recipient = toNotificationPerson(buyer);
  const actor = decider ? toNotificationPerson(decider) : undefined;

  if (refundRequest.status === RefundStatus.Approved) {
    await sendSafely(
      notifications,
      {
        kind: "refund-approved",
        recipient,
        actor,
        data: { ...data, decisionNote: refundRequest.decisionNote },
      },
      `refund-approved:${refundRequestId}`
    );
  } else {
    await sendSafely(
      notifications,
      {
        kind: "refund-declined",
        recipient,
        actor,
        data: { ...data, decisionNote: refundRequest.decisionNote ?? "" },
      },
      `refund-declined:${refundRequestId}`
    );
  }
}
