import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { enrollStudent, isEnrolled } from "./enrollments.server";
import { approveRefundRequest, raiseRefundRequest } from "./refunds.server";
import { claimSeat } from "./seat-claims.server";
import {
  fakeNotifications,
  type FakeNotifications,
} from "./notifications.fake.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let teamAdmin: typeof schema.users.$inferSelect;
let notifications: FakeNotifications;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  notifications = fakeNotifications();

  teamAdmin = db
    .insert(schema.users)
    .values({
      name: "Tess Admin",
      email: "tess@example.com",
      role: schema.UserRole.Student,
    })
    .returning()
    .get();
});

function buySeats(seats: number, country: string | null = null) {
  const team = db.insert(schema.teams).values({}).returning().get();
  const purchase = db
    .insert(schema.purchases)
    .values({
      userId: teamAdmin.id,
      courseId: base.course.id,
      amountPaid: 7900 * seats,
      country,
      createdAt: NOW.toISOString(),
    })
    .returning()
    .get();
  const seatRows = Array.from({ length: seats }, (_, i) =>
    db
      .insert(schema.coupons)
      .values({
        teamId: team.id,
        courseId: base.course.id,
        code: `SEAT-${purchase.id}-${i}`,
        purchaseId: purchase.id,
      })
      .returning()
      .get()
  );
  return { purchase, seats: seatRows };
}

describe("claiming a Seat", () => {
  it("enrols the Student and marks the Seat claimed", async () => {
    const { seats } = buySeats(1);

    const result = await claimSeat(
      db,
      seats[0].code,
      base.user.id,
      "GB",
      NOW,
      notifications
    );

    expect(result).toMatchObject({
      ok: true,
      seat: { redeemedByUserId: base.user.id, redeemedAt: NOW.toISOString() },
      enrollment: { userId: base.user.id, courseId: base.course.id },
    });
    expect(isEnrolled(db, base.user.id, base.course.id)).toBe(true);
  });

  it("refuses a code that does not exist", async () => {
    expect(
      await claimSeat(db, "NOPE", base.user.id, "GB", NOW, notifications)
    ).toEqual({
      ok: false,
      error: "Seat not found",
    });
  });

  it("refuses a Seat someone else has claimed", async () => {
    const { seats } = buySeats(1);
    await claimSeat(
      db,
      seats[0].code,
      addStudent("Ben").id,
      "GB",
      NOW,
      notifications
    );

    expect(
      await claimSeat(db, seats[0].code, base.user.id, "GB", NOW, notifications)
    ).toEqual({
      ok: false,
      error: "This Seat has already been claimed",
    });
    expect(isEnrolled(db, base.user.id, base.course.id)).toBe(false);
  });

  it("refuses a Seat on hold while its Team Licence has an Open Refund Request", async () => {
    const { purchase, seats } = buySeats(2);
    raise(purchase.id);

    expect(
      await claimSeat(db, seats[0].code, base.user.id, "GB", NOW, notifications)
    ).toEqual({
      ok: false,
      error:
        "This Seat can't be claimed right now. Ask the person who shared it with you.",
    });
    expect(isEnrolled(db, base.user.id, base.course.id)).toBe(false);
  });

  it("refuses a Seat whose Team Licence was refunded", async () => {
    const { purchase, seats } = buySeats(2);
    const platformAdmin = addStudent("Pat");
    await approveRefundRequest(db, await raise(purchase.id), platformAdmin.id, null, NOW, fakeNotifications());

    expect(
      await claimSeat(db, seats[0].code, base.user.id, "GB", NOW, notifications)
    ).toEqual({
      ok: false,
      error:
        "This Seat is no longer available. Ask the person who shared it with you.",
    });
    expect(isEnrolled(db, base.user.id, base.course.id)).toBe(false);
  });

  it("refuses a Student already enrolled and leaves the Seat unclaimed", async () => {
    const { seats } = buySeats(1);
    await enrollStudent(
      db,
      base.user.id,
      base.course.id,
      NOW,
      fakeNotifications()
    );

    expect(
      await claimSeat(db, seats[0].code, base.user.id, "GB", NOW, notifications)
    ).toEqual({
      ok: false,
      error: "You are already enrolled in this course",
    });
    expect(
      (
        await claimSeat(
          db,
          seats[0].code,
          addStudent("Ben").id,
          "GB",
          NOW,
          notifications
        )
      ).ok
    ).toBe(true);
  });

  it("refuses a Student in a different country from the Team Admin", async () => {
    const { seats } = buySeats(1, "GB");

    expect(
      await claimSeat(db, seats[0].code, base.user.id, "IN", NOW, notifications)
    ).toEqual({
      ok: false,
      error:
        "This Seat can only be claimed from the same country as the Team Licence was bought in",
    });
    expect(isEnrolled(db, base.user.id, base.course.id)).toBe(false);
  });

  it("refuses an enrolled Student for that reason, before the country", async () => {
    const { seats } = buySeats(1, "GB");
    await enrollStudent(
      db,
      base.user.id,
      base.course.id,
      NOW,
      fakeNotifications()
    );

    expect(
      await claimSeat(db, seats[0].code, base.user.id, "IN", NOW, notifications)
    ).toEqual({
      ok: false,
      error: "You are already enrolled in this course",
    });
  });
});

describe("the Seat claim Notification", () => {
  it("tells the Team Admin who claimed which course, and how many Seats are left", async () => {
    const { seats } = buySeats(3);

    await claimSeat(db, seats[0].code, base.user.id, "GB", NOW, notifications);

    expect(sentOfKind("seat-claimed")).toEqual([
      {
        kind: "seat-claimed",
        recipient: expect.objectContaining({
          id: teamAdmin.id,
          name: "Tess Admin",
          email: "tess@example.com",
        }),
        actor: expect.objectContaining({ id: base.user.id }),
        data: {
          seatId: seats[0].id,
          courseId: base.course.id,
          courseTitle: base.course.title,
          seatsLeft: 2,
          url: "/team",
        },
        idempotencyKey: `seat-claimed:${seats[0].id}`,
      },
    ]);
  });

  it("sends one Notification per claim, counting the Seats left down", async () => {
    const { seats } = buySeats(2);

    await claimSeat(db, seats[0].code, base.user.id, "GB", NOW, notifications);
    await claimSeat(
      db,
      seats[1].code,
      addStudent("Ben").id,
      "GB",
      NOW,
      notifications
    );

    expect(
      sentOfKind("seat-claimed").map((n) => [
        n.idempotencyKey,
        n.kind === "seat-claimed" && n.data.seatsLeft,
      ])
    ).toEqual([
      [`seat-claimed:${seats[0].id}`, 1],
      [`seat-claimed:${seats[1].id}`, 0],
    ]);
  });

  it("sends nothing for a Seat on hold", async () => {
    const { purchase, seats } = buySeats(2);
    raise(purchase.id);

    await claimSeat(db, seats[0].code, base.user.id, "GB", NOW, notifications);

    expect(notifications.sent).toEqual([]);
  });

  it("sends nothing for a Seat whose Team Licence was refunded", async () => {
    const { purchase, seats } = buySeats(2);
    await approveRefundRequest(
      db,
      await raise(purchase.id),
      addStudent("Pat").id,
      null,
      NOW,
      fakeNotifications()
    );

    await claimSeat(db, seats[0].code, base.user.id, "GB", NOW, notifications);

    expect(notifications.sent).toEqual([]);
  });

  it("still claims the Seat when the port fails, and logs it", async () => {
    const { seats } = buySeats(1);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    notifications.failWith(new Error("Knock is down"));

    const result = await claimSeat(
      db,
      seats[0].code,
      base.user.id,
      "GB",
      NOW,
      notifications
    );

    expect(result).toMatchObject({
      ok: true,
      seat: { redeemedByUserId: base.user.id },
    });
    expect(isEnrolled(db, base.user.id, base.course.id)).toBe(true);
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining("seat-claimed:"),
      "Knock is down"
    );
    logged.mockRestore();
  });
});

describe("the new Enrollment Notification from a Seat claim", () => {
  it("tells the course's Instructor that the Student enrolled", async () => {
    const { seats } = buySeats(1);

    const result = await claimSeat(
      db,
      seats[0].code,
      base.user.id,
      "GB",
      NOW,
      notifications
    );
    if (!result.ok) throw new Error(result.error);

    expect(sentOfKind("new-enrollment")).toEqual([
      {
        kind: "new-enrollment",
        recipient: expect.objectContaining({ id: base.instructor.id }),
        actor: expect.objectContaining({ id: base.user.id }),
        data: {
          enrollmentId: result.enrollment.id,
          courseId: base.course.id,
          courseTitle: base.course.title,
          url: `/instructor/${base.course.id}/students`,
        },
        idempotencyKey: `enrollment:${result.enrollment.id}`,
      },
    ]);
  });

  it("is not sent when the claim is refused", async () => {
    const { seats } = buySeats(1, "GB");

    await claimSeat(db, seats[0].code, base.user.id, "IN", NOW, notifications);

    expect(sentOfKind("new-enrollment")).toEqual([]);
  });
});

function sentOfKind(kind: string) {
  return notifications.sent.filter((n) => n.kind === kind);
}

function addStudent(name: string) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase()}@example.com`,
      role: schema.UserRole.Student,
    })
    .returning()
    .get();
}

async function raise(purchaseId: number) {
  const result = await raiseRefundRequest(db, purchaseId, teamAdmin.id, "No.", NOW, fakeNotifications());
  if (!result.ok) throw new Error(result.error);
  return result.refundRequestId;
}
