// Day arithmetic, in the server's calendar days. Private to the clock module.

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function dayOfMoment(when: Date): string {
  const month = String(when.getMonth() + 1).padStart(2, "0");
  const day = String(when.getDate()).padStart(2, "0");
  return `${when.getFullYear()}-${month}-${day}`;
}

/** A day label read as midnight UTC, so two of them are always 24 hours apart. */
export function momentOfDay(day: string): number {
  return Date.parse(`${day}T00:00:00.000Z`);
}
