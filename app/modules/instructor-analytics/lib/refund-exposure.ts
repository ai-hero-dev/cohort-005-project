import { splitRevenue } from "~/lib/analytics";
import { clockAt } from "~/modules/clock";
import {
  daysLeftInRefundWindow,
  isWithinRefundWindow,
} from "~/modules/refund-window";
import type { ExposedCourse, RefundExposure } from "./types";

// ─── Refund exposure ───
// Gross revenue is reported the moment a purchase lands, but a purchase is
// refundable for fourteen days, so some of what this page calls revenue is
// still the learner's money. This panel says how much of it is.
/** A purchase, reduced to what the refund window needs to know. */
export type ExposureRow = {
  courseId: number;
  title: string;
  amountPaid: number;
  createdAt: string;
};

/**
 * Of `rows`, the ones still inside their refund window on the day `now`
 * falls on, grouped by course. `totalGrossCents` is what the share is a
 * share of.
 */
export function summariseRefundExposure(
  rows: ExposureRow[],
  totalGrossCents: number,
  now: Date
): RefundExposure {
  const clock = clockAt(now);
  const exposedByCourse = new Map<number, ExposedCourse>();
  let exposedGrossCents = 0;
  let exposedPurchaseCount = 0;
  let closingTodayCount = 0;

  for (const row of rows) {
    if (!isWithinRefundWindow(row.createdAt, clock)) continue;

    const daysLeft = daysLeftInRefundWindow(row.createdAt, clock);

    exposedGrossCents += row.amountPaid;
    exposedPurchaseCount += 1;
    if (daysLeft === 0) closingTodayCount += 1;

    const existing = exposedByCourse.get(row.courseId);

    if (existing === undefined) {
      exposedByCourse.set(row.courseId, {
        courseId: row.courseId,
        title: row.title,
        grossCents: row.amountPaid,
        purchaseCount: 1,
        daysLeft,
      });
    } else {
      existing.grossCents += row.amountPaid;
      existing.purchaseCount += 1;
      // The course's headline is its most urgent purchase, not its newest.
      existing.daysLeft = Math.min(existing.daysLeft, daysLeft);
    }
  }

  return {
    grossCents: exposedGrossCents,
    netCents: splitRevenue(exposedGrossCents).netCents,
    purchaseCount: exposedPurchaseCount,
    sharePercent:
      totalGrossCents === 0
        ? 0
        : Math.round((exposedGrossCents / totalGrossCents) * 100),
    closingTodayCount,
    courses: [...exposedByCourse.values()].sort(
      (a, b) => b.grossCents - a.grossCents
    ),
  };
}
