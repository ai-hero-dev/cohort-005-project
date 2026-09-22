// The day arithmetic the refund window is counted in. Private to the module:
// nothing outside it should be doing day maths of its own.

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * A moment as the day it falls on, `YYYY-MM-DD`, in UTC.
 *
 * UTC is the clock `created_at` is written in, so a Learner in Auckland and a
 * Learner in Los Angeles get the same answer for the same Purchase.
 */
export function utcDay(when: Date): string {
  return when.toISOString().slice(0, 10);
}

/** The day `days` whole days after the moment `iso` names. */
export function utcDayAfter(iso: string, days: number): string {
  return utcDay(new Date(new Date(iso).getTime() + days * MS_PER_DAY));
}

/** Whole days from one `YYYY-MM-DD` to another. Negative if `to` is earlier. */
export function wholeDaysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) /
      MS_PER_DAY
  );
}
