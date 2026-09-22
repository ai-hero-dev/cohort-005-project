// The day arithmetic the refund window is counted in. Private to the module:
// nothing outside it should be doing day maths of its own.

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * A moment as the calendar day it falls on, `YYYY-MM-DD`, on the server's
 * clock — the same day the course page and the refund action read.
 */
export function calendarDay(when: Date): string {
  const month = String(when.getMonth() + 1).padStart(2, "0");
  const day = String(when.getDate()).padStart(2, "0");
  return `${when.getFullYear()}-${month}-${day}`;
}

/** The day `days` whole calendar days after the moment `iso` names. */
export function calendarDayAfter(iso: string, days: number): string {
  const later = new Date(iso);
  later.setDate(later.getDate() + days);
  return calendarDay(later);
}

/** Whole days from one `YYYY-MM-DD` to another. Negative if `to` is earlier. */
export function wholeDaysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) /
      MS_PER_DAY
  );
}
