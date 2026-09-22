// Day arithmetic, in UTC. Private to the refund window.
//
// UTC is the clock every `created_at` is written in, so a Learner in Auckland
// and a Learner in Los Angeles get the same answer for the same row.

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function dayOfMoment(when: Date): string {
  return when.toISOString().slice(0, 10);
}

export function momentOfDay(day: string): number {
  return Date.parse(`${day}T00:00:00.000Z`);
}

/** The day `days` whole days after the moment `iso` names. */
export function addDays(iso: string, days: number): string {
  return dayOfMoment(new Date(new Date(iso).getTime() + days * MS_PER_DAY));
}

/** Whole days from one day to another. Negative when `to` is the earlier one. */
export function daysBetween(from: string, to: string): number {
  return Math.round((momentOfDay(to) - momentOfDay(from)) / MS_PER_DAY);
}
