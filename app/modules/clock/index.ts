import { MS_PER_DAY, dayOfMoment, momentOfDay } from "./lib/calendar-days";

// ─── The clock ───
//
// Reading the current time is the one thing a rule cannot do and stay
// testable. Every rule in this codebase that needs to know what day it is
// takes a `Clock` and asks it, so a test can answer instead.
//
// Days are whole calendar days on the server's clock, moved on with `setDate`:
// the same days the course page and the refund action have always counted.

/** A day, as `YYYY-MM-DD`. Two of them compare correctly as strings. */
export type CalendarDay = string;

/**
 * The seam. Anything that needs today takes one of these rather than calling
 * `new Date()`, which is what makes it callable from a test.
 */
export type Clock = {
  today(): CalendarDay;
};

/** The adapter that reads the machine's clock. Production passes this one. */
export const systemClock: Clock = {
  today: () => dayOfMoment(new Date()),
};

/** The calendar day a moment falls on, from the ISO string a column holds. */
export function calendarDayOf(iso: string): CalendarDay {
  return dayOfMoment(new Date(iso));
}

/** The day `days` whole days after the moment `iso` names. */
export function addDays(iso: string, days: number): CalendarDay {
  const later = new Date(iso);
  later.setDate(later.getDate() + days);
  return dayOfMoment(later);
}

/** Whole days from one day to another. Negative when `to` is the earlier one. */
export function daysBetween(from: CalendarDay, to: CalendarDay): number {
  return Math.round((momentOfDay(to) - momentOfDay(from)) / MS_PER_DAY);
}
