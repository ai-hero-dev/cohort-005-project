import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { enrollStudent, isEnrolled } from "./enrollments.server";
import { approveRefundRequest, raiseRefundRequest } from "./refunds.server";
import {
  fakeNotifications,
  type FakeNotifications,
} from "./notifications.fake.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let notifications: FakeNotifications;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  notifications = fakeNotifications();
});

describe("enrolling a Student", () => {
  it("gives the Student an Enrollment on the course", async () => {
    expect(
      await enrollStudent(db, base.user.id, base.course.id, NOW, notifications)
    ).toMatchObject({
      ok: true,
      enrollment: {
        userId: base.user.id,
        courseId: base.course.id,
        enrolledAt: NOW.toISOString(),
      },
    });
  });

  it("refuses a Student who is already enrolled", async () => {
    await enrollStudent(db, base.user.id, base.course.id, NOW, notifications);

    expect(
      await enrollStudent(db, base.user.id, base.course.id, NOW, notifications)
    ).toEqual({
      ok: false,
      error: "You are already enrolled in this course",
    });
  });

  it("refuses a course that does not exist", async () => {
    expect(
      await enrollStudent(db, base.user.id, 9999, NOW, notifications)
    ).toEqual({
      ok: false,
      error: "Course not found",
    });
  });

  it("re-enrols a Lapsed Student whose Individual Purchase was refunded", async () => {
    const purchase = db
      .insert(schema.purchases)
      .values({
        userId: base.user.id,
        courseId: base.course.id,
        amountPaid: 7900,
        createdAt: NOW.toISOString(),
      })
      .returning()
      .get();
    await enrollStudent(db, base.user.id, base.course.id, NOW, notifications);

    const raised = await raiseRefundRequest(
      db,
      purchase.id,
      base.user.id,
      "No.",
      NOW,
      fakeNotifications()
    );
    if (!raised.ok) throw new Error(raised.error);
    const platformAdmin = db
      .insert(schema.users)
      .values({
        name: "Pat Admin",
        email: "pat@example.com",
        role: schema.UserRole.Admin,
      })
      .returning()
      .get();
    await approveRefundRequest(
      db,
      raised.refundRequestId,
      platformAdmin.id,
      null,
      NOW,
      fakeNotifications()
    );
    expect(isEnrolled(db, base.user.id, base.course.id)).toBe(false);

    const later = new Date(2026, 9, 20, 12, 0, 0);
    const reEnrolled = await enrollStudent(
      db,
      base.user.id,
      base.course.id,
      later,
      notifications
    );
    expect(reEnrolled).toMatchObject({
      ok: true,
      enrollment: { enrolledAt: later.toISOString() },
    });
    expect(isEnrolled(db, base.user.id, base.course.id)).toBe(true);

    // The Instructor hears about the re-enrolment too, as a new Enrollment.
    if (!reEnrolled.ok) throw new Error(reEnrolled.error);
    expect(notifications.sent).toHaveLength(2);
    expect(notifications.sent[1]).toMatchObject({
      kind: "new-enrollment",
      recipient: { id: base.instructor.id },
      idempotencyKey: `enrollment:${reEnrolled.enrollment.id}`,
    });
    const [first, second] = notifications.sent.map((n) => n.idempotencyKey);
    expect(first).not.toBe(second);
  });
});

describe("the new Enrollment Notification", () => {
  it("tells the course's Instructor which Student enrolled on which course", async () => {
    const result = await enrollStudent(
      db,
      base.user.id,
      base.course.id,
      NOW,
      notifications
    );
    if (!result.ok) throw new Error(result.error);

    expect(notifications.sent).toEqual([
      {
        kind: "new-enrollment",
        recipient: {
          id: base.instructor.id,
          name: "Test Instructor",
          email: "instructor@example.com",
          avatarUrl: null,
        },
        actor: {
          id: base.user.id,
          name: "Test User",
          email: "test@example.com",
          avatarUrl: null,
        },
        data: {
          enrollmentId: result.enrollment.id,
          courseId: base.course.id,
          courseTitle: "Test Course",
          url: `/instructor/${base.course.id}/students`,
        },
        idempotencyKey: `enrollment:${result.enrollment.id}`,
      },
    ]);
  });

  it("is not sent when the Enrollment is refused", async () => {
    await enrollStudent(db, base.user.id, base.course.id, NOW, notifications);
    notifications.sent.length = 0;

    await enrollStudent(db, base.user.id, base.course.id, NOW, notifications);
    await enrollStudent(db, base.user.id, 9999, NOW, notifications);

    expect(notifications.sent).toEqual([]);
  });

  it("is logged when the port fails, and the Enrollment still succeeds", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    notifications.failWith(new Error("Knock is down"));

    const result = await enrollStudent(
      db,
      base.user.id,
      base.course.id,
      NOW,
      notifications
    );

    expect(result).toMatchObject({ ok: true });
    expect(isEnrolled(db, base.user.id, base.course.id)).toBe(true);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("enrollment:"),
      "Knock is down"
    );
    consoleError.mockRestore();
  });
});
