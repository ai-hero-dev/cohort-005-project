import {
  and,
  count,
  countDistinct,
  eq,
  isNull,
  ne,
  notExists,
  or,
  sql,
  sum,
} from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import {
  CourseStatus,
  UserRole,
  comments,
  courses,
  lessons,
  modules,
  purchases,
  users,
} from "~/db/schema";
import { parseAnalyticsRange, rangeStart, splitRevenue } from "~/lib/analytics";
import {
  getRatingSummary,
  getRevenueOverTime,
  getStudentRevenue,
  getTopBuyers,
} from "./lib/overview";
import {
  getCourseDropOff,
  getCourseProgressSummary,
  getCourseQuizPassRates,
  getCourseRevenueByCountry,
} from "./lib/course";
import { summariseRefundExposure } from "./lib/refund-exposure";
import { purchaseScope, ownedBy } from "./lib/scope";
import type { Db, RevenueSummary } from "./lib/types";

// The shapes a caller reads off the result.
export type {
  RevenueSummary,
  RevenuePoint,
  RevenueSeries,
  StudentRevenue,
  TopBuyer,
  RatingSummary,
  CourseProgressSummary,
  FunnelLesson,
  FunnelModule,
  CourseFunnel,
  QuizPassRate,
  CountryRevenueRow,
  CourseCountryRevenue,
  ExposedCourse,
  RefundExposure,
} from "./lib/types";

// ─── Instructor Analytics ───
// Everything the instructor analytics page shows, computed in one call from
// the viewer, the page's search params and the current time.
//
// The search params are taken raw on purpose: who may see which instructor's
// figures, and which course a viewer may drill into, are decided here, so
// tests reach those rules the same way the page does.

export type AnalyticsViewer = { userId: number; isAdmin: boolean };

// "course" is the second tab; anything else falls back to the overview.
export type AnalyticsTab = "overview" | "course";

/** A search param that should be a row id, or null if it isn't one. */
function parseId(value: string | null): number | null {
  const id = Number(value);
  return value !== null && Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Every figure on the instructor analytics page.
 *
 * Never throws on bad params: an unknown range, tab, instructor or course
 * falls back to its default. `now` is the only clock read, so the same
 * database, params and `now` always produce the same result.
 */
export function getInstructorAnalytics(
  db: Db,
  { userId, isAdmin }: AnalyticsViewer,
  params: URLSearchParams,
  now: Date
) {
  const range = parseAnalyticsRange(params.get("range"));
  const tab: AnalyticsTab =
    params.get("tab") === "course" ? "course" : "overview";

  // Instructors are pinned to their own figures; only an admin may look
  // elsewhere, and null means "every instructor".
  const instructorId = isAdmin ? parseId(params.get("instructor")) : userId;

  // The selector lists every course the viewer owns rather than only the ones
  // that sold: a course nobody is finishing is exactly what this tab is for.
  const courseOptions = db
    .select({ courseId: courses.id, title: courses.title })
    .from(courses)
    .where(ownedBy(instructorId))
    .orderBy(courses.title)
    .all();

  const requestedCourseId = parseId(params.get("course"));
  // Checked against the list rather than trusted: the id arrives in the URL,
  // and an instructor may not read another instructor's funnel.
  const selectedCourseId = courseOptions.some(
    (course) => course.courseId === requestedCourseId
  )
    ? requestedCourseId
    : null;

  // Unanswered questions. A question qualifies when it is top-level, not
  // deleted, not written by staff, and has no reply from the course's
  // instructor or an admin.
  const questionsSince = rangeStart(range, now);
  const questionAuthor = alias(users, "author");
  const reply = alias(comments, "reply");
  const replyAuthor = alias(users, "reply_author");

  // Correlated: matches a live reply, by staff, to the outer question.
  const staffReply = db
    .select({ one: sql`1` })
    .from(reply)
    .innerJoin(replyAuthor, eq(replyAuthor.id, reply.userId))
    .where(
      and(
        eq(reply.parentId, comments.id),
        isNull(reply.deletedAt),
        or(
          eq(replyAuthor.role, UserRole.Admin),
          eq(reply.userId, courses.instructorId)
        )
      )
    );

  const questionConditions = [
    isNull(comments.parentId),
    isNull(comments.deletedAt),
    // Staff asking their own question shouldn't queue up as work for themselves.
    ne(questionAuthor.role, UserRole.Admin),
    ne(comments.userId, courses.instructorId),
    notExists(staffReply),
  ];

  if (instructorId !== null) {
    questionConditions.push(eq(courses.instructorId, instructorId));
  }

  const questionRow = db
    .select({
      inRange:
        questionsSince === null
          ? count(comments.id)
          : sql<number>`sum(case when ${comments.createdAt} >= ${questionsSince} then 1 else 0 end)`,
      total: count(comments.id),
    })
    .from(comments)
    .innerJoin(questionAuthor, eq(comments.userId, questionAuthor.id))
    .innerJoin(lessons, eq(comments.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(and(...questionConditions))
    .get();

  // sum() is null over an empty set; count() is already 0.
  const questionsInRange = Number(questionRow?.inRange ?? 0);
  const questions = {
    inRange: questionsInRange,
    older: (questionRow?.total ?? 0) - questionsInRange,
  };

  // Gross revenue, the platform's fee and the instructor's net for the range.
  const summaryRow = db
    .select({
      gross: sum(purchases.amountPaid),
      purchaseCount: count(purchases.id),
    })
    .from(purchases)
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(purchaseScope(instructorId, range, now))
    .get();

  // sum() returns null over an empty set, and a string when SQLite has rows.
  const summary: RevenueSummary = {
    ...splitRevenue(Number(summaryRow?.gross ?? 0)),
    purchaseCount: summaryRow?.purchaseCount ?? 0,
  };

  // Revenue broken down by course, biggest earner first. Courses with no sales
  // in the range are absent rather than listed at zero.
  const courseRevenueRows = db
    .select({
      courseId: courses.id,
      title: courses.title,
      gross: sum(purchases.amountPaid),
      purchaseCount: count(purchases.id),
    })
    .from(purchases)
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(purchaseScope(instructorId, range, now))
    .groupBy(courses.id)
    .all();

  const courseRevenue = courseRevenueRows
    .map((row) => ({
      courseId: row.courseId,
      title: row.title,
      ...splitRevenue(Number(row.gross ?? 0)),
      purchaseCount: row.purchaseCount,
    }))
    .sort((a, b) => b.grossCents - a.grossCents);

  // How many people paid, and how many are learning. Deliberately two numbers:
  // one team purchase is a single buyer covering several seats, and someone who
  // redeems a seat enrols without a purchase row of their own.
  const buyerCountRow = db
    .select({ buyerCount: countDistinct(purchases.userId) })
    .from(purchases)
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(purchaseScope(instructorId, range, now))
    .get();

  const students = getStudentRevenue(db, instructorId, range, now);
  const attributedRevenue = students.reduce(
    (total, student) => total + student.revenueCents,
    0
  );

  const audience = {
    buyerCount: buyerCountRow?.buyerCount ?? 0,
    studentCount: students.length,
    revenuePerStudentCents:
      students.length === 0
        ? null
        : Math.round(attributedRevenue / students.length),
  };

  // Everyone who owns at least one course, for the admin's instructor picker.
  // Owners rather than users with the instructor role: an admin who owns a
  // course contributes to the platform-wide total.
  const instructors = isAdmin
    ? db
        .selectDistinct({ id: users.id, name: users.name })
        .from(courses)
        .innerJoin(users, eq(courses.instructorId, users.id))
        .orderBy(users.name)
        .all()
    : [];

  // Drives the "publish your first course" empty state. The platform-wide view
  // always has courses in it, so the prompt only makes sense for one named
  // instructor.
  const publishedRow =
    instructorId === null
      ? undefined
      : db
          .select({ id: courses.id })
          .from(courses)
          .where(
            and(
              eq(courses.instructorId, instructorId),
              eq(courses.status, CourseStatus.Published)
            )
          )
          .get();

  // Refund exposure. Every purchase in the range; which of them are still
  // inside their refund window is `lib/refund-exposure.ts`'s question.
  const exposureRows = db
    .select({
      courseId: courses.id,
      title: courses.title,
      amountPaid: purchases.amountPaid,
      createdAt: purchases.createdAt,
    })
    .from(purchases)
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(purchaseScope(instructorId, range, now))
    .all();

  const refundExposure = summariseRefundExposure(
    exposureRows,
    summary.grossCents,
    now
  );

  return {
    // Split rather than filtered: the range applies, but questions older than
    // it are still reported, because months of silence is the urgent case.
    questions,
    audience,
    buyers: getTopBuyers(db, instructorId, range, now),
    ratings: getRatingSummary(db, instructorId, range, now),
    tab,
    range,
    isAdmin,
    instructorId,
    selectedCourseId,
    summary,
    series: getRevenueOverTime(db, instructorId, range, now),
    courses: courseRevenue,
    courseOptions,
    // Progress and drop-off carry no usable timestamp, so they span all time
    // whatever the range control says — and the tab says so on screen.
    progress:
      selectedCourseId === null
        ? null
        : getCourseProgressSummary(db, selectedCourseId),
    funnel:
      selectedCourseId === null ? null : getCourseDropOff(db, selectedCourseId),
    // Quiz attempts and purchases are both timestamped, so unlike the two
    // panels above these do honour the range control.
    quizzes:
      selectedCourseId === null
        ? null
        : getCourseQuizPassRates(db, selectedCourseId, range, now),
    countries:
      selectedCourseId === null
        ? null
        : getCourseRevenueByCountry(db, selectedCourseId, range, now),
    instructors,
    refundExposure,
    unpublished: instructorId !== null && publishedRow === undefined,
  };
}

export type InstructorAnalytics = ReturnType<typeof getInstructorAnalytics>;
