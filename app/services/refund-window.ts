import { splitRevenue } from "~/lib/analytics";

// ─── The refund window ───
//
// A Purchase is refundable for fourteen days. Until that window closes, the
// money is reported as revenue but is still the Learner's, and an Instructor
// looking at a revenue figure is looking at a number that can go down.
//
// This module owns the day arithmetic behind that sentence. It takes plain
// rows and the current time and gives back the answer. It never reads the
// clock and it never reads the database, so a caller — a loader, a test,
// anything — decides both.

/** The length of the refund window, in whole days. See `GLOSSARY.md`. */
export const REFUND_WINDOW_DAYS = 14;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** A purchase, reduced to the four things the window cares about. */
export type PurchaseInWindow = {
  courseId: number;
  courseTitle: string;
  amountPaidCents: number;
  /** When the Purchase was made, as the ISO string the column holds. */
  purchasedAt: string;
};

/** One Course's share of the exposure, with its most urgent Purchase. */
export type ExposedCourse = {
  courseId: number;
  title: string;
  grossCents: number;
  purchaseCount: number;
  /** Days until the first of this Course's Purchases leaves the window. */
  daysLeft: number;
};

/** Money taken that could still go back out, and where it sits. */
export type RefundExposure = {
  grossCents: number;
  netCents: number;
  purchaseCount: number;
  /** Exposed gross as a whole-number percentage of the gross it was taken from. */
  sharePercent: number;
  closingTodayCount: number;
  /** Biggest exposure first. */
  courses: ExposedCourse[];
};

/**
 * The window is counted in whole days, not hours: somebody who buys at 23:00
 * gets the whole of their fourteenth day. The day is read in UTC, the clock
 * `created_at` is written in, so a Learner in Auckland and a Learner in Los
 * Angeles get the same answer for the same Purchase.
 */
function utcDay(when: Date): string {
  return when.toISOString().slice(0, 10);
}

function lastDayOfWindow(purchasedAt: string): string {
  return utcDay(
    new Date(new Date(purchasedAt).getTime() + REFUND_WINDOW_DAYS * MS_PER_DAY)
  );
}

function wholeDaysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T00:00:00.000Z`).getTime() -
      new Date(`${from}T00:00:00.000Z`).getTime()) /
      MS_PER_DAY
  );
}

/**
 * How much of a set of Purchases is still refundable, at a given moment.
 *
 * `totalGrossCents` is the gross the Purchases were drawn from, and is only
 * used for `sharePercent` — pass the figure the caller is showing next to
 * this one, so the two agree.
 */
export function summariseRefundExposure(input: {
  purchases: PurchaseInWindow[];
  totalGrossCents: number;
  now: Date;
}): RefundExposure {
  const today = utcDay(input.now);
  const byCourse = new Map<number, ExposedCourse>();

  let grossCents = 0;
  let purchaseCount = 0;
  let closingTodayCount = 0;

  for (const purchase of input.purchases) {
    const lastDay = lastDayOfWindow(purchase.purchasedAt);
    if (today > lastDay) continue;

    const daysLeft = Math.max(0, wholeDaysBetween(today, lastDay));

    grossCents += purchase.amountPaidCents;
    purchaseCount += 1;
    if (daysLeft === 0) closingTodayCount += 1;

    const existing = byCourse.get(purchase.courseId);

    if (existing === undefined) {
      byCourse.set(purchase.courseId, {
        courseId: purchase.courseId,
        title: purchase.courseTitle,
        grossCents: purchase.amountPaidCents,
        purchaseCount: 1,
        daysLeft,
      });
    } else {
      existing.grossCents += purchase.amountPaidCents;
      existing.purchaseCount += 1;
      // A Course is headlined by its most urgent Purchase, not its newest.
      existing.daysLeft = Math.min(existing.daysLeft, daysLeft);
    }
  }

  return {
    grossCents,
    netCents: splitRevenue(grossCents).netCents,
    purchaseCount,
    sharePercent:
      input.totalGrossCents === 0
        ? 0
        : Math.round((grossCents / input.totalGrossCents) * 100),
    closingTodayCount,
    courses: [...byCourse.values()].sort((a, b) => b.grossCents - a.grossCents),
  };
}
