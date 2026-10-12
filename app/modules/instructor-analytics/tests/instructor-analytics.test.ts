import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { CourseStatus, LessonProgressStatus, UserRole } from "~/db/schema";
import { markdown } from "~/lib/text";
import {
  createInstructorAnalytics,
  type AnalyticsViewer,
} from "../index.server";

// Noon UTC keeps every fixture on the same calendar day in local time and in
// UTC, so the refund window (local days) and the chart (UTC days) agree.
const NOW = new Date("2026-10-06T12:00:00.000Z");
const DAY_MS = 86_400_000;

function daysAgo(days: number) {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString();
}

let db: TestDb;
let instructor: typeof schema.users.$inferSelect;
let otherInstructor: typeof schema.users.$inferSelect;
let admin: typeof schema.users.$inferSelect;
let categoryId: number;
let course: typeof schema.courses.$inferSelect;
let otherCourse: typeof schema.courses.$inferSelect;

beforeEach(() => {
  db = createTestDb();
  const base = seedBaseData(db);
  instructor = base.instructor;
  categoryId = base.category.id;
  course = base.course;
  otherInstructor = addUser("Olive Other", UserRole.Instructor);
  admin = addUser("Pat Admin", UserRole.Admin);
  otherCourse = addCourse(otherInstructor.id, "Other Course");
});

// ─── Fixtures ───
// Nothing else writes most of these tables from a service, so rows go in
// directly. Kept in one place so a schema change touches only this block.

let slugCounter = 0;

function addUser(name: string, role = UserRole.Student) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase().replaceAll(" ", ".")}@example.com`,
      role,
    })
    .returning()
    .get();
}

function addCourse(
  instructorId: number,
  title: string,
  status = CourseStatus.Published
) {
  slugCounter += 1;
  return db
    .insert(schema.courses)
    .values({
      title,
      slug: `course-${slugCounter}`,
      description: title,
      salesCopy: markdown(title),
      instructorId,
      categoryId,
      status,
    })
    .returning()
    .get();
}

function addModule(courseId: number, title: string, position: number) {
  return db
    .insert(schema.modules)
    .values({ courseId, title, position })
    .returning()
    .get();
}

function addLesson(moduleId: number, title: string, position: number) {
  return db
    .insert(schema.lessons)
    .values({ moduleId, title, position })
    .returning()
    .get();
}

function buy(
  userId: number,
  courseId: number,
  amountPaid: number,
  { daysBack = 2, country = "US" as string | null } = {}
) {
  return db
    .insert(schema.purchases)
    .values({
      userId,
      courseId,
      amountPaid,
      country,
      createdAt: daysAgo(daysBack),
    })
    .returning()
    .get();
}

function buySeats(
  buyerId: number,
  courseId: number,
  seatCount: number,
  amountPaid: number,
  daysBack = 2
) {
  const purchase = buy(buyerId, courseId, amountPaid, { daysBack });
  const team = db.insert(schema.teams).values({}).returning().get();
  const seats = Array.from({ length: seatCount }, (_, index) =>
    db
      .insert(schema.coupons)
      .values({
        teamId: team.id,
        courseId,
        code: `SEAT-${purchase.id}-${index}`,
        purchaseId: purchase.id,
      })
      .returning()
      .get()
  );
  return { purchase, seats };
}

function enroll(userId: number, courseId: number, daysBack = 2) {
  db.insert(schema.enrollments)
    .values({ userId, courseId, enrolledAt: daysAgo(daysBack) })
    .run();
}

function claimSeat(
  seat: typeof schema.coupons.$inferSelect,
  userId: number,
  daysBack = 1
) {
  db.update(schema.coupons)
    .set({ redeemedByUserId: userId, redeemedAt: daysAgo(daysBack) })
    .where(eq(schema.coupons.id, seat.id))
    .run();
  enroll(userId, seat.courseId, daysBack);
}

function rate(userId: number, courseId: number, rating: number, daysBack = 2) {
  db.insert(schema.courseRatings)
    .values({
      userId,
      courseId,
      rating,
      createdAt: daysAgo(daysBack),
      updatedAt: daysAgo(daysBack),
    })
    .run();
}

function comment(
  lessonId: number,
  userId: number,
  { daysBack = 2, parentId = null as number | null, deleted = false } = {}
) {
  return db
    .insert(schema.comments)
    .values({
      lessonId,
      userId,
      parentId,
      body: markdown("A comment"),
      createdAt: daysAgo(daysBack),
      deletedAt: deleted ? daysAgo(daysBack) : null,
    })
    .returning()
    .get();
}

function progress(
  userId: number,
  lessonId: number,
  status: LessonProgressStatus
) {
  db.insert(schema.lessonProgress).values({ userId, lessonId, status }).run();
}

function addQuiz(lessonId: number, title: string, passingScore: number) {
  return db
    .insert(schema.quizzes)
    .values({ lessonId, title, passingScore })
    .returning()
    .get();
}

function attempt(
  userId: number,
  quizId: number,
  score: number,
  passed: boolean,
  daysBack = 2
) {
  db.insert(schema.quizAttempts)
    .values({ userId, quizId, score, passed, attemptedAt: daysAgo(daysBack) })
    .run();
}

function analytics(
  viewer: AnalyticsViewer,
  params: Record<string, string> = {}
) {
  return createInstructorAnalytics(db).get(
    viewer,
    new URLSearchParams(params),
    NOW
  );
}

function asInstructor(params: Record<string, string> = {}) {
  return analytics({ userId: instructor.id, isAdmin: false }, params);
}

function asAdmin(params: Record<string, string> = {}) {
  return analytics({ userId: admin.id, isAdmin: true }, params);
}

// ─── Tests ───

describe("who sees what", () => {
  it("pins an instructor to their own figures, whatever the URL says", () => {
    const student = addUser("Sam Student");
    buy(student.id, course.id, 1000);
    buy(student.id, otherCourse.id, 5000);

    const result = asInstructor({ instructor: String(otherInstructor.id) });

    expect(result.instructorId).toBe(instructor.id);
    expect(result.summary.grossCents).toBe(1000);
  });

  it("shows an admin every instructor's figures when none is picked", () => {
    const student = addUser("Sam Student");
    buy(student.id, course.id, 1000);
    buy(student.id, otherCourse.id, 5000);

    const result = asAdmin();

    expect(result.instructorId).toBeNull();
    expect(result.summary.grossCents).toBe(6000);
  });

  it("narrows an admin to the instructor they pick", () => {
    const student = addUser("Sam Student");
    buy(student.id, course.id, 1000);
    buy(student.id, otherCourse.id, 5000);

    const result = asAdmin({ instructor: String(otherInstructor.id) });

    expect(result.instructorId).toBe(otherInstructor.id);
    expect(result.summary.grossCents).toBe(5000);
  });

  it("treats a junk instructor param from an admin as platform-wide", () => {
    expect(asAdmin({ instructor: "-3" }).instructorId).toBeNull();
    expect(asAdmin({ instructor: "1.5" }).instructorId).toBeNull();
    expect(asAdmin({ instructor: "bob" }).instructorId).toBeNull();
  });

  it("lists course owners, by name, in the admin's instructor picker", () => {
    // An admin who owns a course is an owner too; an instructor with no
    // courses is not.
    addCourse(admin.id, "Admin's Course");
    addUser("Idle Instructor", UserRole.Instructor);

    expect(asAdmin().instructors).toEqual([
      { id: otherInstructor.id, name: "Olive Other" },
      { id: admin.id, name: "Pat Admin" },
      { id: instructor.id, name: "Test Instructor" },
    ]);
  });

  it("gives an instructor no instructor picker", () => {
    expect(asInstructor().instructors).toEqual([]);
  });

  it("flags itself as an admin view only for admins", () => {
    expect(asAdmin().isAdmin).toBe(true);
    expect(asInstructor().isAdmin).toBe(false);
  });
});

describe("search params", () => {
  it("falls back to the defaults when params are missing", () => {
    const result = asInstructor();

    expect(result.range).toBe("30d");
    expect(result.tab).toBe("overview");
    expect(result.selectedCourseId).toBeNull();
  });

  it("falls back to the defaults when params are junk", () => {
    const result = asInstructor({
      range: "forever",
      tab: "settings",
      course: "abc",
    });

    expect(result.range).toBe("30d");
    expect(result.tab).toBe("overview");
    expect(result.selectedCourseId).toBeNull();
  });

  it("reads a valid range and the course tab", () => {
    const result = asInstructor({ range: "90d", tab: "course" });

    expect(result.range).toBe("90d");
    expect(result.tab).toBe("course");
  });
});

describe("the course picker", () => {
  it("offers every course the viewer owns, sold or not, by title", () => {
    const zebra = addCourse(instructor.id, "Zebra Course", CourseStatus.Draft);
    const alpha = addCourse(instructor.id, "Alpha Course");

    expect(asInstructor().courseOptions).toEqual([
      { courseId: alpha.id, title: "Alpha Course" },
      { courseId: course.id, title: "Test Course" },
      { courseId: zebra.id, title: "Zebra Course" },
    ]);
  });

  it("selects a course the viewer owns", () => {
    const result = asInstructor({ tab: "course", course: String(course.id) });

    expect(result.selectedCourseId).toBe(course.id);
    expect(result.progress).not.toBeNull();
    expect(result.funnel).not.toBeNull();
    expect(result.quizzes).not.toBeNull();
    expect(result.countries).not.toBeNull();
  });

  it("refuses another instructor's course and hides every course panel", () => {
    const result = asInstructor({ course: String(otherCourse.id) });

    expect(result.selectedCourseId).toBeNull();
    expect(result.progress).toBeNull();
    expect(result.funnel).toBeNull();
    expect(result.quizzes).toBeNull();
    expect(result.countries).toBeNull();
  });

  it("refuses a course id that doesn't exist", () => {
    expect(asInstructor({ course: "9999" }).selectedCourseId).toBeNull();
  });

  it("lets an admin pick any course when viewing platform-wide", () => {
    expect(asAdmin({ course: String(otherCourse.id) }).selectedCourseId).toBe(
      otherCourse.id
    );
  });
});

describe("revenue summary", () => {
  it("splits gross into the platform fee and the instructor's net", () => {
    const student = addUser("Sam Student");
    buy(student.id, course.id, 7900);
    buy(student.id, course.id, 2100);

    expect(asInstructor().summary).toEqual({
      grossCents: 10000,
      feeCents: 2000,
      netCents: 8000,
      purchaseCount: 2,
    });
  });

  it("is all zeroes with no sales", () => {
    expect(asInstructor().summary).toEqual({
      grossCents: 0,
      feeCents: 0,
      netCents: 0,
      purchaseCount: 0,
    });
  });

  it("only counts purchases inside the range", () => {
    const student = addUser("Sam Student");
    buy(student.id, course.id, 1000, { daysBack: 29 });
    buy(student.id, course.id, 2000, { daysBack: 31 });
    buy(student.id, course.id, 4000, { daysBack: 400 });

    expect(asInstructor({ range: "30d" }).summary.grossCents).toBe(1000);
    expect(asInstructor({ range: "90d" }).summary.grossCents).toBe(3000);
    expect(asInstructor({ range: "all" }).summary.grossCents).toBe(7000);
  });

  it("includes a purchase landing exactly on the start of the range", () => {
    const student = addUser("Sam Student");
    buy(student.id, course.id, 1000, { daysBack: 7 });

    expect(asInstructor({ range: "7d" }).summary.grossCents).toBe(1000);
  });

  it("rounds the fee and still adds up", () => {
    const student = addUser("Sam Student");
    buy(student.id, course.id, 999);

    expect(asInstructor().summary).toMatchObject({
      grossCents: 999,
      feeCents: 200,
      netCents: 799,
    });
  });
});

describe("revenue by course", () => {
  it("lists courses biggest earner first, leaving out unsold ones", () => {
    const small = addCourse(instructor.id, "Small Earner");
    addCourse(instructor.id, "Never Sold");
    const student = addUser("Sam Student");
    buy(student.id, small.id, 500);
    buy(student.id, course.id, 3000);
    buy(student.id, course.id, 2000);

    expect(asInstructor().courses).toEqual([
      {
        courseId: course.id,
        title: "Test Course",
        grossCents: 5000,
        feeCents: 1000,
        netCents: 4000,
        purchaseCount: 2,
      },
      {
        courseId: small.id,
        title: "Small Earner",
        grossCents: 500,
        feeCents: 100,
        netCents: 400,
        purchaseCount: 1,
      },
    ]);
  });
});

describe("audience", () => {
  it("counts buyers and students separately, sharing a team licence across its claimed seats", () => {
    const soloBuyer = addUser("Alice Solo");
    buy(soloBuyer.id, course.id, 10000);
    enroll(soloBuyer.id, course.id);

    const teamBuyer = addUser("Bob Manager");
    const { seats } = buySeats(teamBuyer.id, course.id, 3, 9999);
    claimSeat(seats[0], addUser("Cat Claimer").id);
    claimSeat(seats[1], addUser("Dan Claimer").id);

    // Students: Alice (10000), Cat and Dan (a third of 9999 each).
    expect(asInstructor().audience).toEqual({
      buyerCount: 2,
      studentCount: 3,
      revenuePerStudentCents: 5555,
    });
  });

  it("has no revenue per student when nobody is enrolled", () => {
    buy(addUser("Alice Solo").id, course.id, 10000);

    expect(asInstructor().audience).toEqual({
      buyerCount: 1,
      studentCount: 0,
      revenuePerStudentCents: null,
    });
  });

  it("only counts students who enrolled inside the range", () => {
    enroll(addUser("Recent").id, course.id, 3);
    enroll(addUser("Long Ago").id, course.id, 60);

    expect(asInstructor({ range: "30d" }).audience.studentCount).toBe(1);
    expect(asInstructor({ range: "all" }).audience.studentCount).toBe(2);
  });

  it("credits a student only for what they paid on this instructor's courses", () => {
    const student = addUser("Alice Solo");
    buy(student.id, course.id, 4000);
    buy(student.id, otherCourse.id, 9000);
    enroll(student.id, course.id);

    expect(asInstructor().audience.revenuePerStudentCents).toBe(4000);
  });

  it("credits a team buyer who claims their own seat only for that seat", () => {
    const manager = addUser("Bob Manager");
    const { seats } = buySeats(manager.id, course.id, 2, 10000);
    claimSeat(seats[0], manager.id);
    claimSeat(seats[1], addUser("Cat Claimer").id);

    expect(asInstructor().audience).toEqual({
      buyerCount: 1,
      studentCount: 2,
      revenuePerStudentCents: 5000,
    });
  });
});

describe("top buyers", () => {
  it("ranks buyers by spend, with their seats and whether they enrolled", () => {
    const soloBuyer = addUser("Alice Solo");
    buy(soloBuyer.id, course.id, 10000);
    enroll(soloBuyer.id, course.id);

    const teamBuyer = addUser("Bob Manager");
    const { seats } = buySeats(teamBuyer.id, course.id, 3, 9999);
    claimSeat(seats[0], addUser("Cat Claimer").id);
    claimSeat(seats[1], addUser("Dan Claimer").id);

    expect(asInstructor().buyers).toEqual([
      {
        userId: soloBuyer.id,
        name: "Alice Solo",
        email: "alice.solo@example.com",
        spendCents: 10000,
        purchaseCount: 1,
        seatsBought: 0,
        seatsUnredeemed: 0,
        enrolled: true,
      },
      {
        userId: teamBuyer.id,
        name: "Bob Manager",
        email: "bob.manager@example.com",
        spendCents: 9999,
        purchaseCount: 1,
        seatsBought: 3,
        seatsUnredeemed: 1,
        enrolled: false,
      },
    ]);
  });

  it("does not multiply a team licence's spend by its seat count", () => {
    const teamBuyer = addUser("Bob Manager");
    buySeats(teamBuyer.id, course.id, 5, 20000);

    expect(asInstructor().buyers[0]).toMatchObject({
      spendCents: 20000,
      purchaseCount: 1,
      seatsBought: 5,
    });
  });

  it("shows only the top ten", () => {
    for (let rank = 1; rank <= 11; rank++) {
      buy(addUser(`Buyer ${rank}`).id, course.id, rank * 100);
    }

    const buyers = asInstructor().buyers;

    expect(buyers).toHaveLength(10);
    expect(buyers[0].name).toBe("Buyer 11");
    expect(buyers.at(-1)?.name).toBe("Buyer 2");
  });

  it("counts an enrolment from before the range", () => {
    const buyer = addUser("Alice Solo");
    enroll(buyer.id, course.id, 200);
    buy(buyer.id, course.id, 1000, { daysBack: 2 });

    expect(asInstructor({ range: "7d" }).buyers[0].enrolled).toBe(true);
  });

  it("does not count an enrolment on another instructor's course", () => {
    const buyer = addUser("Alice Solo");
    buy(buyer.id, course.id, 1000);
    enroll(buyer.id, otherCourse.id);

    expect(asInstructor().buyers[0].enrolled).toBe(false);
  });

  it("only counts spend inside the range", () => {
    const buyer = addUser("Alice Solo");
    buy(buyer.id, course.id, 1000, { daysBack: 2 });
    buy(buyer.id, course.id, 5000, { daysBack: 60 });

    expect(asInstructor({ range: "30d" }).buyers[0].spendCents).toBe(1000);
  });
});

describe("ratings", () => {
  it("averages ratings in the range to one decimal place", () => {
    rate(addUser("A").id, course.id, 5);
    rate(addUser("B").id, course.id, 4);
    rate(addUser("C").id, course.id, 4);
    rate(addUser("D").id, course.id, 1, 40);
    rate(addUser("E").id, otherCourse.id, 1);

    expect(asInstructor({ range: "30d" }).ratings).toEqual({
      average: 4.3,
      count: 3,
    });
  });

  it("has no average without ratings", () => {
    expect(asInstructor().ratings).toEqual({ average: null, count: 0 });
  });
});

describe("unanswered questions", () => {
  let lessonId: number;
  let student: typeof schema.users.$inferSelect;

  beforeEach(() => {
    const module = addModule(course.id, "Basics", 1);
    lessonId = addLesson(module.id, "Lesson 1", 1).id;
    student = addUser("Sam Student");
  });

  it("counts a student's question nobody has answered", () => {
    comment(lessonId, student.id);

    expect(asInstructor().questions).toEqual({ inRange: 1, older: 0 });
  });

  it("does not count a question the course's instructor answered", () => {
    const question = comment(lessonId, student.id);
    comment(lessonId, instructor.id, { parentId: question.id });

    expect(asInstructor().questions).toEqual({ inRange: 0, older: 0 });
  });

  it("does not count a question an admin answered", () => {
    const question = comment(lessonId, student.id);
    comment(lessonId, admin.id, { parentId: question.id });

    expect(asInstructor().questions).toEqual({ inRange: 0, older: 0 });
  });

  it("still counts a question only another student answered", () => {
    const question = comment(lessonId, student.id);
    comment(lessonId, addUser("Helpful Peer").id, { parentId: question.id });

    expect(asInstructor().questions).toEqual({ inRange: 1, older: 0 });
  });

  it("still counts a question answered by an instructor of a different course", () => {
    const question = comment(lessonId, student.id);
    comment(lessonId, otherInstructor.id, { parentId: question.id });

    expect(asInstructor().questions).toEqual({ inRange: 1, older: 0 });
  });

  it("still counts a question whose staff reply was deleted", () => {
    const question = comment(lessonId, student.id);
    comment(lessonId, instructor.id, { parentId: question.id, deleted: true });

    expect(asInstructor().questions).toEqual({ inRange: 1, older: 0 });
  });

  it("does not count a deleted question", () => {
    comment(lessonId, student.id, { deleted: true });

    expect(asInstructor().questions).toEqual({ inRange: 0, older: 0 });
  });

  it("does not count questions staff asked", () => {
    comment(lessonId, instructor.id);
    comment(lessonId, admin.id);

    expect(asInstructor().questions).toEqual({ inRange: 0, older: 0 });
  });

  it("does not count replies as questions", () => {
    const question = comment(lessonId, student.id);
    comment(lessonId, addUser("Helpful Peer").id, { parentId: question.id });
    comment(lessonId, student.id, { parentId: question.id });

    expect(asInstructor().questions).toEqual({ inRange: 1, older: 0 });
  });

  it("reports questions older than the range rather than dropping them", () => {
    comment(lessonId, student.id, { daysBack: 2 });
    comment(lessonId, student.id, { daysBack: 100 });

    expect(asInstructor({ range: "30d" }).questions).toEqual({
      inRange: 1,
      older: 1,
    });
    expect(asInstructor({ range: "all" }).questions).toEqual({
      inRange: 2,
      older: 0,
    });
  });

  it("ignores questions on another instructor's courses", () => {
    const otherModule = addModule(otherCourse.id, "Elsewhere", 1);
    comment(addLesson(otherModule.id, "Their lesson", 1).id, student.id);

    expect(asInstructor().questions).toEqual({ inRange: 0, older: 0 });
    expect(asAdmin().questions).toEqual({ inRange: 1, older: 0 });
  });
});

describe("revenue over time", () => {
  it("has a daily point for every day of a fixed range, sales or not", () => {
    const student = addUser("Sam Student");
    buy(student.id, course.id, 3000, { daysBack: 5 });
    buy(student.id, course.id, 2000, { daysBack: 5 });
    buy(student.id, course.id, 1000, { daysBack: 0 });

    expect(asInstructor({ range: "7d" }).series).toEqual({
      granularity: "day",
      points: [
        { bucket: "2026-09-29", grossCents: 0, netCents: 0 },
        { bucket: "2026-09-30", grossCents: 0, netCents: 0 },
        { bucket: "2026-10-01", grossCents: 5000, netCents: 4000 },
        { bucket: "2026-10-02", grossCents: 0, netCents: 0 },
        { bucket: "2026-10-03", grossCents: 0, netCents: 0 },
        { bucket: "2026-10-04", grossCents: 0, netCents: 0 },
        { bucket: "2026-10-05", grossCents: 0, netCents: 0 },
        { bucket: "2026-10-06", grossCents: 1000, netCents: 800 },
      ],
    });
  });

  it("spans the whole window even with no sales at all", () => {
    const { points } = asInstructor({ range: "30d" }).series;

    expect(points).toHaveLength(31);
    expect(points[0].bucket).toBe("2026-09-06");
    expect(points.at(-1)?.bucket).toBe("2026-10-06");
    expect(points.every((point) => point.grossCents === 0)).toBe(true);
  });

  it("goes monthly for all time, from the first sale's month to now", () => {
    const student = addUser("Sam Student");
    buy(student.id, course.id, 1000, { daysBack: 80 }); // 18 July
    buy(student.id, course.id, 2500, { daysBack: 26 }); // 10 September

    expect(asInstructor({ range: "all" }).series).toEqual({
      granularity: "month",
      points: [
        { bucket: "2026-07", grossCents: 1000, netCents: 800 },
        { bucket: "2026-08", grossCents: 0, netCents: 0 },
        { bucket: "2026-09", grossCents: 2500, netCents: 2000 },
        { bucket: "2026-10", grossCents: 0, netCents: 0 },
      ],
    });
  });

  it("is empty for all time with no sales", () => {
    expect(asInstructor({ range: "all" }).series).toEqual({
      granularity: "month",
      points: [],
    });
  });
});

describe("refund exposure", () => {
  it("adds up purchases still inside their refund window", () => {
    const secondCourse = addCourse(instructor.id, "Second Course");
    const student = addUser("Sam Student");
    buy(student.id, course.id, 10000, { daysBack: 3 });
    buy(student.id, course.id, 5000, { daysBack: 14 });
    buy(student.id, course.id, 4000, { daysBack: 15 });
    buy(student.id, secondCourse.id, 2000, { daysBack: 1 });

    expect(asInstructor({ range: "30d" }).refundExposure).toEqual({
      grossCents: 17000,
      netCents: 13600,
      purchaseCount: 3,
      sharePercent: 81,
      closingTodayCount: 1,
      courses: [
        {
          courseId: course.id,
          title: "Test Course",
          grossCents: 15000,
          purchaseCount: 2,
          daysLeft: 0,
        },
        {
          courseId: secondCourse.id,
          title: "Second Course",
          grossCents: 2000,
          purchaseCount: 1,
          daysLeft: 13,
        },
      ],
    });
  });

  it("keeps the fourteenth day open and closes the fifteenth", () => {
    const student = addUser("Sam Student");
    buy(student.id, course.id, 1000, { daysBack: 14 });
    buy(student.id, course.id, 2000, { daysBack: 15 });

    expect(asInstructor().refundExposure).toMatchObject({
      grossCents: 1000,
      closingTodayCount: 1,
    });
  });

  it("counts days left from today, with a purchase made today having fourteen", () => {
    buy(addUser("Sam Student").id, course.id, 1000, { daysBack: 0 });

    expect(asInstructor().refundExposure.courses[0].daysLeft).toBe(14);
  });

  it("only looks at purchases inside the selected range", () => {
    buy(addUser("Sam Student").id, course.id, 1000, { daysBack: 10 });

    expect(asInstructor({ range: "7d" }).refundExposure.grossCents).toBe(0);
    expect(asInstructor({ range: "30d" }).refundExposure.grossCents).toBe(1000);
  });

  it("is empty with no sales", () => {
    expect(asInstructor().refundExposure).toEqual({
      grossCents: 0,
      netCents: 0,
      purchaseCount: 0,
      sharePercent: 0,
      closingTodayCount: 0,
      courses: [],
    });
  });

  it("moves with the clock it is given", () => {
    buy(addUser("Sam Student").id, course.id, 1000, { daysBack: 3 });
    const aWeekLater = new Date(NOW.getTime() + 7 * DAY_MS);
    const twelveDaysLater = new Date(NOW.getTime() + 12 * DAY_MS);
    const viewer = { userId: instructor.id, isAdmin: false };
    const params = new URLSearchParams();

    expect(
      createInstructorAnalytics(db).get(viewer, params, aWeekLater)
        .refundExposure.courses[0].daysLeft
    ).toBe(4);
    expect(
      createInstructorAnalytics(db).get(viewer, params, twelveDaysLater)
        .refundExposure.grossCents
    ).toBe(0);
  });
});

describe("the publish-your-first-course prompt", () => {
  it("shows for an instructor with nothing published", () => {
    const newcomer = addUser("New Instructor", UserRole.Instructor);
    addCourse(newcomer.id, "Work in progress", CourseStatus.Draft);

    expect(analytics({ userId: newcomer.id, isAdmin: false }).unpublished).toBe(
      true
    );
  });

  it("hides once the instructor has published a course", () => {
    expect(asInstructor().unpublished).toBe(false);
  });

  it("never shows on the platform-wide view", () => {
    expect(asAdmin().unpublished).toBe(false);
  });
});

describe("course progress", () => {
  let lessonIds: number[];

  beforeEach(() => {
    const first = addModule(course.id, "Basics", 1);
    const second = addModule(course.id, "Advanced", 2);
    lessonIds = [
      addLesson(first.id, "Lesson 1", 1).id,
      addLesson(first.id, "Lesson 2", 2).id,
      addLesson(second.id, "Lesson 3", 1).id,
    ];
  });

  function courseTab(params: Record<string, string> = {}) {
    return asInstructor({
      tab: "course",
      course: String(course.id),
      ...params,
    });
  }

  it("averages completion across every enrollee, including those who never started", () => {
    const finisher = addUser("Finisher");
    const starter = addUser("Starter");
    const vanished = addUser("Vanished");
    for (const student of [finisher, starter, vanished]) {
      enroll(student.id, course.id);
    }
    for (const lessonId of lessonIds) {
      progress(finisher.id, lessonId, LessonProgressStatus.Completed);
    }
    progress(starter.id, lessonIds[0], LessonProgressStatus.Completed);
    progress(starter.id, lessonIds[1], LessonProgressStatus.InProgress);

    // (100 + 33⅓ + 0) / 3
    expect(courseTab().progress).toEqual({
      enrolledCount: 3,
      totalLessons: 3,
      averageProgressPercent: 44,
      finishedCount: 1,
    });
  });

  it("ignores progress on other courses' lessons", () => {
    const student = addUser("Student");
    enroll(student.id, course.id);
    const elsewhere = addModule(otherCourse.id, "Elsewhere", 1);
    progress(
      student.id,
      addLesson(elsewhere.id, "Their lesson", 1).id,
      LessonProgressStatus.Completed
    );

    expect(courseTab().progress?.averageProgressPercent).toBe(0);
  });

  it("spans all time whatever the range", () => {
    enroll(addUser("Long Ago").id, course.id, 300);

    expect(courseTab({ range: "7d" }).progress?.enrolledCount).toBe(1);
  });

  it("has no average with nobody enrolled", () => {
    expect(courseTab().progress).toEqual({
      enrolledCount: 0,
      totalLessons: 3,
      averageProgressPercent: null,
      finishedCount: 0,
    });
  });

  it("has no average for a course without lessons", () => {
    const empty = addCourse(instructor.id, "Empty Course");
    enroll(addUser("Student").id, empty.id);

    expect(asInstructor({ course: String(empty.id) }).progress).toEqual({
      enrolledCount: 1,
      totalLessons: 0,
      averageProgressPercent: null,
      finishedCount: 0,
    });
  });
});

describe("drop-off funnel", () => {
  let lessonIds: number[];
  let firstModuleId: number;
  let secondModuleId: number;

  beforeEach(() => {
    // Inserted out of order: the funnel follows position, not id.
    secondModuleId = addModule(course.id, "Advanced", 2).id;
    firstModuleId = addModule(course.id, "Basics", 1).id;
    const lesson3 = addLesson(secondModuleId, "Lesson 3", 1).id;
    const lesson2 = addLesson(firstModuleId, "Lesson 2", 2).id;
    const lesson1 = addLesson(firstModuleId, "Lesson 1", 1).id;
    lessonIds = [lesson1, lesson2, lesson3];
  });

  function funnel() {
    return asInstructor({ course: String(course.id) }).funnel;
  }

  it("counts each student as reaching every lesson up to their furthest", () => {
    const [lesson1, lesson2, lesson3] = lessonIds;
    // Skipped straight to the end: still counted as passing through 1 and 2.
    const skipper = addUser("Skipper");
    const steady = addUser("Steady");
    const quitter = addUser("Quitter");
    const neverStarted = addUser("Never Started");
    const opened = addUser("Opened Only");
    for (const student of [skipper, steady, quitter, neverStarted, opened]) {
      enroll(student.id, course.id);
    }
    progress(skipper.id, lesson3, LessonProgressStatus.InProgress);
    progress(steady.id, lesson1, LessonProgressStatus.Completed);
    progress(steady.id, lesson2, LessonProgressStatus.Completed);
    progress(quitter.id, lesson1, LessonProgressStatus.InProgress);
    progress(opened.id, lesson1, LessonProgressStatus.NotStarted);

    expect(funnel()).toEqual({
      enrolledCount: 5,
      modules: [
        {
          moduleId: firstModuleId,
          title: "Basics",
          reachedCount: 3,
          dropWithin: 1,
          lessons: [
            {
              lessonId: lesson1,
              title: "Lesson 1",
              reachedCount: 3,
              dropFromPrevious: 2,
            },
            {
              lessonId: lesson2,
              title: "Lesson 2",
              reachedCount: 2,
              dropFromPrevious: 1,
            },
          ],
        },
        {
          moduleId: secondModuleId,
          title: "Advanced",
          reachedCount: 1,
          dropWithin: 0,
          lessons: [
            {
              lessonId: lesson3,
              title: "Lesson 3",
              reachedCount: 1,
              dropFromPrevious: 1,
            },
          ],
        },
      ],
    });
  });

  it("ignores progress from someone not enrolled", () => {
    progress(
      addUser("Tourist").id,
      lessonIds[2],
      LessonProgressStatus.Completed
    );

    const result = funnel();

    expect(result?.enrolledCount).toBe(0);
    expect(result?.modules.map((module) => module.reachedCount)).toEqual([
      0, 0,
    ]);
  });

  it("ignores progress from someone enrolled only on a different course", () => {
    const tourist = addUser("Tourist");
    enroll(tourist.id, otherCourse.id);
    progress(tourist.id, lessonIds[2], LessonProgressStatus.Completed);

    expect(funnel()?.modules.map((module) => module.reachedCount)).toEqual([
      0, 0,
    ]);
  });

  it("has no modules for a course without lessons", () => {
    const empty = addCourse(instructor.id, "Empty Course");
    enroll(addUser("Student").id, empty.id);

    expect(asInstructor({ course: String(empty.id) }).funnel).toEqual({
      enrolledCount: 1,
      modules: [],
    });
  });
});

describe("quiz pass rates", () => {
  let lesson1: number;
  let lesson3: number;

  beforeEach(() => {
    const first = addModule(course.id, "Basics", 1);
    const second = addModule(course.id, "Advanced", 2);
    lesson1 = addLesson(first.id, "Lesson 1", 1).id;
    lesson3 = addLesson(second.id, "Lesson 3", 1).id;
  });

  function quizzes(params: Record<string, string> = {}) {
    return asInstructor({ course: String(course.id), ...params }).quizzes;
  }

  it("judges each student by their best attempt", () => {
    const quiz = addQuiz(lesson1, "Basics Quiz", 0.7);
    const improver = addUser("Improver");
    const struggler = addUser("Struggler");
    attempt(improver.id, quiz.id, 0.5, false);
    attempt(improver.id, quiz.id, 0.9, true);
    attempt(struggler.id, quiz.id, 0.6, false);

    expect(quizzes()).toEqual([
      {
        quizId: quiz.id,
        title: "Basics Quiz",
        moduleTitle: "Basics",
        lessonTitle: "Lesson 1",
        passingScorePercent: 70,
        studentCount: 2,
        passedCount: 1,
        passRatePercent: 50,
        averageBestScorePercent: 75,
      },
    ]);
  });

  it("trusts the verdict recorded on the best attempt", () => {
    // Failed under an older, stricter pass mark; not re-judged now.
    const quiz = addQuiz(lesson1, "Basics Quiz", 0.7);
    attempt(addUser("Student").id, quiz.id, 0.72, false);

    expect(quizzes()?.[0]).toMatchObject({
      passedCount: 0,
      passRatePercent: 0,
    });
  });

  it("lists quizzes in curriculum order, including unattempted ones", () => {
    const later = addQuiz(lesson3, "Advanced Quiz", 0.8);
    const earlier = addQuiz(lesson1, "Basics Quiz", 0.7);

    expect(quizzes()?.map((quiz) => quiz.quizId)).toEqual([
      earlier.id,
      later.id,
    ]);
    expect(quizzes()?.[1]).toMatchObject({
      studentCount: 0,
      passedCount: 0,
      passRatePercent: null,
      averageBestScorePercent: null,
    });
  });

  it("only counts attempts inside the range", () => {
    const quiz = addQuiz(lesson3, "Advanced Quiz", 0.8);
    attempt(addUser("Student").id, quiz.id, 0.85, true, 40);

    expect(quizzes({ range: "30d" })?.[0].studentCount).toBe(0);
    expect(quizzes({ range: "all" })?.[0]).toMatchObject({
      studentCount: 1,
      passRatePercent: 100,
      averageBestScorePercent: 85,
    });
  });

  it("is empty for a course without quizzes", () => {
    expect(quizzes()).toEqual([]);
  });
});

describe("revenue by country", () => {
  function countries(params: Record<string, string> = {}) {
    return asInstructor({ course: String(course.id), ...params }).countries;
  }

  it("breaks sales down by country, biggest first, with parity discounts", () => {
    const student = addUser("Student");
    buy(student.id, course.id, 10000, { country: "US" });
    buy(student.id, course.id, 10000, { country: "US" });
    buy(student.id, course.id, 8000, { country: null });
    buy(student.id, course.id, 5000, { country: "IN" });
    buy(student.id, course.id, 3000, { country: "NG" });

    expect(countries()).toEqual({
      grossCents: 36000,
      netCents: 28800,
      purchaseCount: 5,
      discountedGrossCents: 8000,
      discountedNetCents: 6400,
      discountedSharePercent: 22,
      rows: [
        {
          country: "US",
          purchaseCount: 2,
          grossCents: 20000,
          netCents: 16000,
          sharePercent: 56,
          averagePaidCents: 10000,
          discountPercent: 0,
        },
        {
          country: null,
          purchaseCount: 1,
          grossCents: 8000,
          netCents: 6400,
          sharePercent: 22,
          averagePaidCents: 8000,
          discountPercent: null,
        },
        {
          country: "IN",
          purchaseCount: 1,
          grossCents: 5000,
          netCents: 4000,
          sharePercent: 14,
          averagePaidCents: 5000,
          discountPercent: 50,
        },
        {
          country: "NG",
          purchaseCount: 1,
          grossCents: 3000,
          netCents: 2400,
          sharePercent: 8,
          averagePaidCents: 3000,
          discountPercent: 70,
        },
      ],
    });
  });

  it("only counts this course's sales inside the range", () => {
    const student = addUser("Student");
    buy(student.id, course.id, 1000, { daysBack: 2 });
    buy(student.id, course.id, 2000, { daysBack: 40 });
    buy(student.id, otherCourse.id, 4000, { daysBack: 2 });

    expect(countries({ range: "30d" })?.grossCents).toBe(1000);
    expect(countries({ range: "all" })?.grossCents).toBe(3000);
  });

  it("is all zeroes with no sales", () => {
    expect(countries()).toEqual({
      grossCents: 0,
      netCents: 0,
      purchaseCount: 0,
      discountedGrossCents: 0,
      discountedNetCents: 0,
      discountedSharePercent: 0,
      rows: [],
    });
  });
});
