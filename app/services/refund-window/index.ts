import { splitRevenue } from "~/lib/analytics";
import { addDays, dayOfMoment, daysBetween } from "./lib/utc";

// ─── The refund window ───
//
// A Purchase is refundable for fourteen days. Until that window closes, the
// money is reported as revenue but is still the Learner's, and an Instructor
// looking at a revenue figure is looking at a number that can go down.
//
// This module owns the fourteen days, and it owns the day arithmetic they are
// counted in. It takes plain rows and a moment, and gives back the answer. It
// never reads the machine's clock and it never reads the database, so a caller
// — a loader, a test, anything — decides both.
//
// The arithmetic used to be a module of its own, `clock`, with a `Clock`
// interface in front of it. One adapter ever implemented that interface, one
// module ever called it, and nobody could read either half without the other
// open. See `docs/adr/0021-the-refund-window-owns-its-own-days.md`.

/** A day, as `YYYY-MM-DD`, in UTC. Two of them compare correctly as strings. */
export type CalendarDay = string;

/** The length of the refund window, in whole days. See `GLOSSARY.md`. */
export const REFUND_WINDOW_DAYS = 14;

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
 * The last day a Learner may still ask for their money back.
 *
 * The window is counted in whole days, not hours: somebody who buys at 23:00
 * gets the whole of their fourteenth day.
 */
export function lastDayOfRefundWindow(purchasedAt: string): CalendarDay {
  return addDays(purchasedAt, REFUND_WINDOW_DAYS);
}

/** Whether the window on a Purchase is still open, as of the clock's today. */
export function isWithinRefundWindow(purchasedAt: string, now: Date): boolean {
  return dayOfMoment(now) <= lastDayOfRefundWindow(purchasedAt);
}

/** Days until the window closes. Zero on the last day, and never negative. */
export function daysLeftInRefundWindow(purchasedAt: string, now: Date): number {
  return Math.max(
    0,
    daysBetween(dayOfMoment(now), lastDayOfRefundWindow(purchasedAt))
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
  const today = dayOfMoment(input.now);
  const byCourse = new Map<number, ExposedCourse>();

  let grossCents = 0;
  let purchaseCount = 0;
  let closingTodayCount = 0;

  for (const purchase of input.purchases) {
    const lastDay = lastDayOfRefundWindow(purchase.purchasedAt);
    if (today > lastDay) continue;

    const daysLeft = Math.max(0, daysBetween(today, lastDay));

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
