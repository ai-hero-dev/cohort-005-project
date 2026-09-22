// Day arithmetic, in UTC. Private to the clock module.

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function dayOfMoment(when: Date): string {
  return when.toISOString().slice(0, 10);
}

export function momentOfDay(day: string): number {
  return Date.parse(`${day}T00:00:00.000Z`);
}
