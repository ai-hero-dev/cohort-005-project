import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { setCurrentUserId, setDevCountry } from "~/lib/session";

let testDb: TestDb;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

import { requireTakeCourse } from "./access.server";

let base: ReturnType<typeof seedBaseData>;

beforeEach(() => {
  testDb = createTestDb();
  base = seedBaseData(testDb);
  testDb
    .update(schema.courses)
    .set({ price: 10000, pppEnabled: true })
    .where(eq(schema.courses.id, base.course.id))
    .run();
});

async function requestAs(userId: number | null, country?: string) {
  let request = new Request("http://localhost:3000");
  if (userId === null) return request;
  let cookie = await setCurrentUserId(request, userId);
  if (country) {
    request = new Request("http://localhost:3000", {
      headers: { Cookie: cookie.split(";")[0] },
    });
    cookie = await setDevCountry(request, country);
  }
  return new Request("http://localhost:3000", {
    headers: { Cookie: cookie.split(";")[0] },
  });
}

function enroll(userId: number) {
  testDb
    .insert(schema.enrollments)
    .values({ userId, courseId: base.course.id })
    .run();
}

function purchase(userId: number, country: string) {
  testDb
    .insert(schema.purchases)
    .values({ userId, courseId: base.course.id, amountPaid: 5000, country })
    .run();
}

async function statusOf(promise: Promise<unknown>) {
  try {
    await promise;
    return "allowed";
  } catch (error) {
    return (error as { init?: { status?: number } }).init?.status;
  }
}

describe("requireTakeCourse", () => {
  it("allows an enrolled Student who isn't under a Country Lock", async () => {
    enroll(base.user.id);
    purchase(base.user.id, "IN");

    expect(
      await statusOf(
        requireTakeCourse(await requestAs(base.user.id, "IN"), base.course.id)
      )
    ).toBe("allowed");
  });

  it("refuses a signed-out visitor with 401", async () => {
    expect(
      await statusOf(requireTakeCourse(await requestAs(null), base.course.id))
    ).toBe(401);
  });

  it("refuses a signed-in Person without an Enrollment with 403", async () => {
    expect(
      await statusOf(
        requireTakeCourse(await requestAs(base.user.id), base.course.id)
      )
    ).toBe(403);
  });

  it("refuses a Student under a Country Lock with 403", async () => {
    enroll(base.user.id);
    purchase(base.user.id, "IN");

    expect(
      await statusOf(
        requireTakeCourse(await requestAs(base.user.id, "US"), base.course.id)
      )
    ).toBe(403);
  });

  it("refuses the owning Instructor, who has no Enrollment, with 403", async () => {
    expect(
      await statusOf(
        requireTakeCourse(await requestAs(base.instructor.id), base.course.id)
      )
    ).toBe(403);
  });
});
