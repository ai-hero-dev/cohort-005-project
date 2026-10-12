import { and, eq, gte } from "drizzle-orm";
import { type SQLiteColumn } from "drizzle-orm/sqlite-core";
import { courses, purchases } from "~/db/schema";
import { rangeStart, type AnalyticsRange } from "~/lib/analytics";

// Which rows a figure is computed over: one instructor's courses (or every
// course), and the range the page is set to.

export function scopeOn(
  dateColumn: SQLiteColumn,
  instructorId: number | null,
  range: AnalyticsRange,
  now: Date
) {
  const conditions = [];

  if (instructorId !== null) {
    conditions.push(eq(courses.instructorId, instructorId));
  }

  const start = rangeStart(range, now);
  if (start !== null) {
    conditions.push(gte(dateColumn, start));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export function purchaseScope(
  instructorId: number | null,
  range: AnalyticsRange,
  now: Date
) {
  return scopeOn(purchases.createdAt, instructorId, range, now);
}

export function sinceRange(
  dateColumn: SQLiteColumn,
  range: AnalyticsRange,
  now: Date
) {
  const start = rangeStart(range, now);
  return start === null ? undefined : gte(dateColumn, start);
}

export function ownedBy(instructorId: number | null) {
  return instructorId === null
    ? undefined
    : eq(courses.instructorId, instructorId);
}
