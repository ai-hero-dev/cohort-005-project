import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import { eq } from "drizzle-orm";
import * as schema from "~/db/schema";
import { setCurrentUserId } from "~/lib/session";
import { createCoursePermissions } from "../course-permissions.server";
import type { Person } from "../person.server";

let db: TestDb;
let permissions: ReturnType<typeof createCoursePermissions>;
let base: ReturnType<typeof seedBaseData>;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  permissions = createCoursePermissions(db);
});

// ─── Fixtures ───

function owningInstructor(country: string | null = null): Person {
  return { id: base.instructor.id, role: "instructor", country };
}

function addUser(
  name: string,
  role: schema.UserRole = schema.UserRole.Student
) {
  return db
    .insert(schema.users)
    .values({ name, email: `${name.replace(/ /g, ".")}@example.com`, role })
    .returning()
    .get();
}

function asPerson(
  user: { id: number },
  role: Person["role"],
  country: string | null = null
): Person {
  return { id: user.id, role, country };
}

function platformAdmin(country: string | null = null): Person {
  return asPerson(
    addUser("Pat Admin", schema.UserRole.Admin),
    "platform-admin",
    country
  );
}

function student(country: string | null = null): Person {
  return asPerson(base.user, "student", country);
}

function enroll(userId: number, courseId = base.course.id) {
  db.insert(schema.enrollments).values({ userId, courseId }).run();
}

let slugCounter = 0;
function addCourse(instructorId = base.instructor.id) {
  slugCounter += 1;
  return db
    .insert(schema.courses)
    .values({
      title: `Other Course ${slugCounter}`,
      slug: `other-course-${slugCounter}`,
      description: "Another course",
      salesCopy: base.course.salesCopy,
      instructorId,
      categoryId: base.category.id,
      status: schema.CourseStatus.Published,
    })
    .returning()
    .get();
}

function addModule(courseId = base.course.id) {
  return db
    .insert(schema.modules)
    .values({ courseId, title: "A module", position: 1 })
    .returning()
    .get();
}

function addLesson(moduleId: number) {
  return db
    .insert(schema.lessons)
    .values({ moduleId, title: "A lesson", position: 1 })
    .returning()
    .get();
}

function setPrice(price: number, pppEnabled = true, courseId = base.course.id) {
  db.update(schema.courses)
    .set({ price, pppEnabled })
    .where(eq(schema.courses.id, courseId))
    .run();
}

function buy(
  userId: number,
  country: string | null,
  createdAt = "2026-01-01T00:00:00.000Z",
  courseId = base.course.id
) {
  return db
    .insert(schema.purchases)
    .values({ userId, courseId, amountPaid: 5000, country, createdAt })
    .returning()
    .get();
}

/** A Team Licence: a Purchase with Seats. */
function buySeats(
  userId: number,
  country: string | null,
  createdAt = "2026-01-01T00:00:00.000Z"
) {
  const purchase = buy(userId, country, createdAt);
  const team = db.insert(schema.teams).values({}).returning().get();
  return db
    .insert(schema.coupons)
    .values({
      teamId: team.id,
      courseId: base.course.id,
      code: `SEAT-${purchase.id}`,
      purchaseId: purchase.id,
    })
    .returning()
    .get();
}

function decideOnCourse(person: Person | null) {
  return permissions.decide(person, { courseId: base.course.id });
}

function makeRequest(headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/", { headers });
}

/** Signs in through the real session cookie, as the DevUI panel does. */
async function signedInRequest(userId: number, headerCountry?: string) {
  const setCookie = await setCurrentUserId(makeRequest(), userId);
  const headers: Record<string, string> = { Cookie: setCookie.split(";")[0] };
  if (headerCountry) headers["CF-IPCountry"] = headerCountry;
  return makeRequest(headers);
}

const NOT_OWNER = {
  allowed: false,
  reason: { kind: "not-owning-instructor-or-platform-admin" },
};

describe("decide", () => {
  it("lets the owning Instructor view and manage, but not take, the course", () => {
    const decisions = permissions.decide(owningInstructor(), {
      courseId: base.course.id,
    });

    expect(decisions).toMatchObject({
      found: true,
      course: { id: base.course.id },
      person: owningInstructor(),
      view: { allowed: true },
      take: { allowed: false, reason: { kind: "not-enrolled" } },
      manage: { allowed: true },
    });
  });

  it("lets a Platform Admin view and manage, but not take, any course", () => {
    expect(decideOnCourse(platformAdmin())).toMatchObject({
      view: { allowed: true },
      take: { allowed: false, reason: { kind: "not-enrolled" } },
      manage: { allowed: true },
    });
  });

  it("lets an enrolled Student view and take, but not manage, the course", () => {
    enroll(base.user.id);

    expect(decideOnCourse(student())).toMatchObject({
      view: { allowed: true },
      take: { allowed: true },
      manage: NOT_OWNER,
    });
  });

  it("refuses an unenrolled Student everything", () => {
    expect(decideOnCourse(student())).toMatchObject({
      view: { allowed: false, reason: { kind: "not-enrolled" } },
      take: { allowed: false, reason: { kind: "not-enrolled" } },
      manage: NOT_OWNER,
    });
  });

  it("refuses nobody everything, because they're signed out", () => {
    const signedOut = { allowed: false, reason: { kind: "signed-out" } };

    expect(decideOnCourse(null)).toEqual({
      found: true,
      course: expect.objectContaining({ id: base.course.id }),
      person: null,
      enrolled: false,
      view: signedOut,
      take: signedOut,
      manage: signedOut,
    });
  });

  it("refuses another Instructor the right to manage a course they don't own", () => {
    const other = asPerson(
      addUser("Other Instructor", schema.UserRole.Instructor),
      "instructor"
    );

    expect(decideOnCourse(other)).toMatchObject({ manage: NOT_OWNER });
  });

  it("lets an owning Instructor whose role is no longer Instructor manage the course", () => {
    const demoted = asPerson(base.instructor, "student");

    expect(decideOnCourse(demoted)).toMatchObject({
      view: { allowed: true },
      manage: { allowed: true },
    });
  });

  it("lets an Instructor or Platform Admin with an Enrollment take the course", () => {
    enroll(base.instructor.id);

    expect(decideOnCourse(owningInstructor())).toMatchObject({
      take: { allowed: true },
    });
  });
});

describe("decide: Enrollment", () => {
  it("says an enrolled Student is enrolled", () => {
    enroll(base.user.id);

    expect(decideOnCourse(student())).toMatchObject({ enrolled: true });
  });

  it("says an unenrolled Student, owning Instructor or Platform Admin is not enrolled", () => {
    expect(decideOnCourse(student())).toMatchObject({ enrolled: false });
    expect(decideOnCourse(owningInstructor())).toMatchObject({
      enrolled: false,
    });
    expect(decideOnCourse(platformAdmin())).toMatchObject({ enrolled: false });
  });

  it("says a Student under Country Lock is still enrolled", () => {
    setPrice(10000);
    enroll(base.user.id);
    buy(base.user.id, "IN");

    expect(decideOnCourse(student("GB"))).toMatchObject({
      enrolled: true,
      take: { allowed: false, reason: { kind: "country-lock" } },
    });
  });
});

describe("decide: Country Lock", () => {
  const locked = (purchaseCountry: string, currentCountry: string) => ({
    allowed: false,
    reason: { kind: "country-lock", purchaseCountry, currentCountry },
  });

  beforeEach(() => {
    setPrice(10000);
    enroll(base.user.id);
  });

  it("locks a Student who bought at a Purchasing-Power Price out of view and take in another country", () => {
    buy(base.user.id, "IN");

    expect(decideOnCourse(student("GB"))).toMatchObject({
      view: locked("IN", "GB"),
      take: locked("IN", "GB"),
    });
  });

  it("doesn't lock a Student in the country they bought in", () => {
    buy(base.user.id, "IN");

    expect(decideOnCourse(student("IN"))).toMatchObject({
      view: { allowed: true },
      take: { allowed: true },
    });
  });

  it("doesn't lock a full-price Purchase", () => {
    buy(base.user.id, "GB");

    expect(decideOnCourse(student("IN"))).toMatchObject({
      take: { allowed: true },
    });
  });

  it("doesn't lock when the current country is unknown", () => {
    buy(base.user.id, "IN");

    expect(decideOnCourse(student(null))).toMatchObject({
      take: { allowed: true },
    });
  });

  it("doesn't lock a course with Purchasing-Power Prices turned off", () => {
    setPrice(10000, false);
    buy(base.user.id, "IN");

    expect(decideOnCourse(student("GB"))).toMatchObject({
      take: { allowed: true },
    });
  });

  it("doesn't lock a free course", () => {
    setPrice(0);
    buy(base.user.id, "IN");

    expect(decideOnCourse(student("GB"))).toMatchObject({
      take: { allowed: true },
    });
  });

  it("exempts the owning Instructor, who still views, takes and manages", () => {
    enroll(base.instructor.id);
    buy(base.instructor.id, "IN");

    expect(decideOnCourse(owningInstructor("GB"))).toMatchObject({
      view: { allowed: true },
      take: { allowed: true },
      manage: { allowed: true },
    });
  });

  it("exempts a Platform Admin", () => {
    const admin = platformAdmin("GB");
    enroll(admin.id);
    buy(admin.id, "IN");

    expect(decideOnCourse(admin)).toMatchObject({
      view: { allowed: true },
      take: { allowed: true },
    });
  });

  it("judges the newest Individual Purchase, not an older one", () => {
    buy(base.user.id, "GB", "2026-01-01T00:00:00.000Z");
    buy(base.user.id, "IN", "2026-02-01T00:00:00.000Z");

    expect(decideOnCourse(student("GB"))).toMatchObject({
      take: locked("IN", "GB"),
    });
  });

  it("judges the Individual Purchase, not a newer Team Licence", () => {
    buy(base.user.id, "IN", "2026-01-01T00:00:00.000Z");
    buySeats(base.user.id, "GB", "2026-02-01T00:00:00.000Z");

    expect(decideOnCourse(student("GB"))).toMatchObject({
      take: locked("IN", "GB"),
    });
  });

  it("never locks a Student on a Claimed Seat with no Individual Purchase", () => {
    const teamAdmin = addUser("Team Admin");
    const seat = buySeats(teamAdmin.id, "IN");
    db.update(schema.coupons)
      .set({
        redeemedByUserId: base.user.id,
        redeemedAt: "2026-01-02T00:00:00.000Z",
      })
      .where(eq(schema.coupons.id, seat.id))
      .run();

    expect(decideOnCourse(student("GB"))).toMatchObject({
      view: { allowed: true },
      take: { allowed: true },
    });
  });
});

describe("requireCapability", () => {
  async function thrownBy(promise: Promise<unknown>) {
    return promise.then(
      () => {
        throw new Error("expected requireCapability to throw");
      },
      (thrown) => thrown
    );
  }

  it("returns the Person and the course when allowed", async () => {
    const request = await signedInRequest(base.instructor.id);

    const { person, course } = await permissions.requireCapability(
      request,
      "manage",
      { slug: "test-course" }
    );

    expect(person).toEqual(owningInstructor());
    expect(course.id).toBe(base.course.id);
  });

  it("throws 404 before 401: a signed-out visitor to a missing course gets not found", async () => {
    const thrown = await thrownBy(
      permissions.requireCapability(makeRequest(), "view", { courseId: "abc" })
    );

    expect(thrown).toMatchObject({ init: { status: 404 } });
  });

  it("throws 401 before 403: a signed-out visitor to a real course must sign in", async () => {
    const thrown = await thrownBy(
      permissions.requireCapability(makeRequest(), "manage", {
        courseId: base.course.id,
      })
    );

    expect(thrown).toMatchObject({
      init: { status: 401 },
      data: "Select a user from the DevUI panel.",
    });
  });

  it("throws 403 when signed in without the capability", async () => {
    const request = await signedInRequest(base.user.id);

    for (const capability of ["view", "take", "manage"] as const) {
      const thrown = await thrownBy(
        permissions.requireCapability(request, capability, {
          courseId: base.course.id,
        })
      );
      expect(thrown).toMatchObject({ init: { status: 403 } });
    }
  });

  it("judges the Country Lock against the request's country", async () => {
    setPrice(10000);
    enroll(base.user.id);
    buy(base.user.id, "IN");
    const request = await signedInRequest(base.user.id, "GB");

    const thrown = await thrownBy(
      permissions.requireCapability(request, "take", {
        courseId: base.course.id,
      })
    );

    expect(thrown).toMatchObject({ init: { status: 403 } });
  });
});

describe("getCourseDecisions", () => {
  it("gives every decision for the request's Person without throwing", async () => {
    const request = await signedInRequest(base.user.id);

    expect(
      await permissions.getCourseDecisions(request, { slug: "test-course" })
    ).toMatchObject({
      found: true,
      person: student(),
      view: { allowed: false, reason: { kind: "not-enrolled" } },
      take: { allowed: false, reason: { kind: "not-enrolled" } },
      manage: NOT_OWNER,
    });
  });

  it("gives not found rather than throwing", async () => {
    expect(
      await permissions.getCourseDecisions(makeRequest(), { slug: "nope" })
    ).toEqual({ found: false });
  });
});

describe("decide: course references", () => {
  it("finds a course by slug", () => {
    expect(
      permissions.decide(owningInstructor(), { slug: "test-course" })
    ).toMatchObject({ found: true, course: { id: base.course.id } });
  });

  it("finds a course through one of its lessons", () => {
    const lesson = addLesson(addModule().id);

    expect(
      permissions.decide(owningInstructor(), { lessonId: lesson.id })
    ).toMatchObject({ found: true, course: { id: base.course.id } });
  });

  it("accepts a lesson or module id that belongs to the course", () => {
    const mod = addModule();
    const lesson = addLesson(mod.id);

    expect(
      permissions.decide(owningInstructor(), {
        slug: "test-course",
        lessonId: String(lesson.id),
      })
    ).toMatchObject({ found: true });
    expect(
      permissions.decide(owningInstructor(), {
        courseId: String(base.course.id),
        moduleId: String(mod.id),
      })
    ).toMatchObject({ found: true });
  });

  it("gives not found for an unknown course", () => {
    expect(permissions.decide(owningInstructor(), { courseId: 9999 })).toEqual({
      found: false,
    });
    expect(
      permissions.decide(owningInstructor(), { slug: "no-such-course" })
    ).toEqual({ found: false });
    expect(permissions.decide(owningInstructor(), { lessonId: 9999 })).toEqual({
      found: false,
    });
  });

  it("gives not found for a lesson or module from another course", () => {
    const otherModule = addModule(addCourse().id);
    const otherLesson = addLesson(otherModule.id);

    expect(
      permissions.decide(owningInstructor(), {
        slug: "test-course",
        lessonId: otherLesson.id,
      })
    ).toEqual({ found: false });
    expect(
      permissions.decide(owningInstructor(), {
        courseId: base.course.id,
        moduleId: otherModule.id,
      })
    ).toEqual({ found: false });
  });

  it("gives not found for a malformed id", () => {
    const mod = addModule();
    addLesson(mod.id);

    for (const malformed of ["abc", "1.5", "-1", "0", "", "1e2"]) {
      expect(
        permissions.decide(owningInstructor(), { courseId: malformed })
      ).toEqual({ found: false });
      expect(
        permissions.decide(owningInstructor(), {
          slug: "test-course",
          lessonId: malformed,
        })
      ).toEqual({ found: false });
      expect(
        permissions.decide(owningInstructor(), {
          courseId: base.course.id,
          moduleId: malformed,
        })
      ).toEqual({ found: false });
    }
  });
});
