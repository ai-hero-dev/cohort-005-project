import {
  addDays,
  daysBetween,
  type CalendarDay,
  type Clock,
} from "~/modules/clock";

// ─── The refund window ───
//
// A Purchase is refundable for fourteen days. Until that window closes, the
// money is reported as revenue but is still the Learner's, and an Instructor
// looking at a revenue figure is looking at a number that can go down.
//
// This module owns the fourteen days. The refund policy asks it whether a
// buyer is still inside them; the analytics page asks it how much revenue
// still is. It never reads the machine's clock and it never reads the
// database: it takes a `Clock`, and the day arithmetic itself belongs to
// `~/modules/clock`.

/** The length of the refund window, in whole calendar days. */
export const REFUND_WINDOW_DAYS = 14;

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
export function isWithinRefundWindow(
  purchasedAt: string,
  clock: Clock
): boolean {
  return clock.today() <= lastDayOfRefundWindow(purchasedAt);
}

/** Days until the window closes. Zero on the last day, and never negative. */
export function daysLeftInRefundWindow(
  purchasedAt: string,
  clock: Clock
): number {
  return Math.max(
    0,
    daysBetween(clock.today(), lastDayOfRefundWindow(purchasedAt))
  );
}
