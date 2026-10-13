import { describe, it, expect, beforeEach, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { LessonProgressStatus, RefundStatus, UserRole } from "~/db/schema";
import {
  approveRefundRequest,
  checkRefundRequest,
  declineRefundRequest,
  getNewestIndividualPurchase,
  getRefundOffer,
  getSeatAvailability,
  listRefundRequestsForBuyer,
  listRefundRequestsForReview,
  listTeamLicences,
  raiseRefundRequest,
} from "./refunds.server";
import { isBookmarked, toggleBookmark } from "./bookmarks.server";
import { getNote, saveNote } from "./notes.server";
import {
  fakeNotifications,
  type FakeNotifications,
} from "./notifications.fake.server";

const NOW = new Date(2026, 9, 6, 12, 0, 0);

function daysBefore(days: number) {
  const when = new Date(NOW);
  when.setDate(when.getDate() - days);
  return when.toISOString();
}

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let platformAdmin: typeof schema.users.$inferSelect;
let lessonIds: number[];
let notifications: FakeNotifications;

beforeEach(() => {
  db = createTestDb();
  notifications = fakeNotifications();
  base = seedBaseData(db);

  platformAdmin = db
    .insert(schema.users)
    .values({
      name: "Pat Admin",
      email: "pat@example.com",
      role: UserRole.Admin,
    })
    .returning()
    .get();

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();

  lessonIds = [1, 2, 3, 4].map(
    (position) =>
      db
        .insert(schema.lessons)
        .values({ moduleId: module.id, title: `Lesson ${position}`, position })
        .returning()
        .get().id
  );
});

function addStudent(name: string) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase()}@example.com`,
      role: UserRole.Student,
    })
    .returning()
    .get();
}

function buyForSelf(userId: number, daysAgo = 3, amountPaid = 7900) {
  const purchase = db
    .insert(schema.purchases)
    .values({
      userId,
      courseId: base.course.id,
      amountPaid,
      createdAt: daysBefore(daysAgo),
    })
    .returning()
    .get();
  db.insert(schema.enrollments)
    .values({ userId, courseId: base.course.id })
    .run();
  return purchase;
}

function buySeats(userId: number, seats: number, daysAgo = 3) {
  const team = db.insert(schema.teams).values({}).returning().get();
  const purchase = db
    .insert(schema.purchases)
    .values({
      userId,
      courseId: base.course.id,
      amountPaid: 7900 * seats,
      createdAt: daysBefore(daysAgo),
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

function claimSeat(seatId: number, userId: number) {
  db.update(schema.coupons)
    .set({ redeemedByUserId: userId, redeemedAt: daysBefore(1) })
    .where(eq(schema.coupons.id, seatId))
    .run();
  db.insert(schema.enrollments)
    .values({ userId, courseId: base.course.id })
    .run();
}

function isEnrolled(userId: number) {
  return !!db
    .select()
    .from(schema.enrollments)
    .where(
      and(
        eq(schema.enrollments.userId, userId),
        eq(schema.enrollments.courseId, base.course.id)
      )
    )
    .get();
}

async function raise(purchaseId: number, buyerId: number) {
  const result = await raiseRefundRequest(
    db,
    purchaseId,
    buyerId,
    "It was not what I expected.",
    NOW,
    notifications
  );
  if (!result.ok) throw new Error(result.error);
  return result.refundRequestId;
}

function getSeat(seatId: number) {
  const seat = db
    .select()
    .from(schema.coupons)
    .where(eq(schema.coupons.id, seatId))
    .get();
  if (!seat) throw new Error("Seat not found");
  return seat;
}

describe("raising a Refund Request", () => {
  it("lets the buyer raise one on an Individual Purchase inside the window", async () => {
    const purchase = buyForSelf(base.user.id);

    const result = await raiseRefundRequest(
      db,
      purchase.id,
      base.user.id,
      "Nope.",
      NOW,
      notifications
    );

    expect(result).toMatchObject({ ok: true, kind: "individual_purchase" });
  });

  it("refuses anyone but the buyer", () => {
    const purchase = buyForSelf(base.user.id);
    const someoneElse = addStudent("Ben");

    expect(
      checkRefundRequest(db, purchase.id, someoneElse.id, NOW)
    ).toMatchObject({ ok: false, status: 404 });
  });

  it("allows only one Open Refund Request per Purchase", async () => {
    const purchase = buyForSelf(base.user.id);
    await raise(purchase.id, base.user.id);

    expect(
      checkRefundRequest(db, purchase.id, base.user.id, NOW)
    ).toMatchObject({ ok: false, status: 409 });
  });

  it("keeps the fourteenth day open and closes the fifteenth", () => {
    const onDay14 = buyForSelf(base.user.id, 14);
    const onDay15 = buyForSelf(addStudent("Ben").id, 15);

    expect(checkRefundRequest(db, onDay14.id, onDay14.userId, NOW).ok).toBe(
      true
    );
    expect(
      checkRefundRequest(db, onDay15.id, onDay15.userId, NOW)
    ).toMatchObject({ ok: false, error: "The 14-day window has closed." });
  });

  it("refuses a buyer who has completed half the lessons", () => {
    const purchase = buyForSelf(base.user.id);
    db.insert(schema.lessonProgress)
      .values(
        lessonIds.slice(0, 2).map((lessonId) => ({
          userId: base.user.id,
          lessonId,
          status: LessonProgressStatus.Completed,
        }))
      )
      .run();

    expect(
      checkRefundRequest(db, purchase.id, base.user.id, NOW)
    ).toMatchObject({ ok: false, status: 403 });
  });

  it("refuses a buyer who has watched two hours", () => {
    const purchase = buyForSelf(base.user.id);
    db.insert(schema.videoWatchEvents)
      .values([
        {
          userId: base.user.id,
          lessonId: lessonIds[0],
          eventType: "progress",
          positionSeconds: 3600,
        },
        {
          userId: base.user.id,
          lessonId: lessonIds[1],
          eventType: "progress",
          positionSeconds: 3600,
        },
      ])
      .run();

    expect(
      checkRefundRequest(db, purchase.id, base.user.id, NOW)
    ).toMatchObject({ ok: false, status: 403 });
  });

  it("refuses a Team Licence with a Claimed Seat", () => {
    const teamAdmin = addStudent("Priya");
    const { purchase, seats } = buySeats(teamAdmin.id, 3);
    claimSeat(seats[0].id, addStudent("Ben").id);

    expect(
      checkRefundRequest(db, purchase.id, teamAdmin.id, NOW)
    ).toMatchObject({
      ok: false,
      status: 403,
    });
  });
});

describe("the newest Individual Purchase of a course", () => {
  it("is the Individual Purchase, not a newer Team Licence", () => {
    const individual = buyForSelf(base.user.id, 3);
    buySeats(base.user.id, 5, 1);

    expect(
      getNewestIndividualPurchase(db, base.user.id, base.course.id)?.id
    ).toBe(individual.id);
  });

  it("is the newest of several Individual Purchases", () => {
    buyForSelf(base.user.id, 5);
    const newer = db
      .insert(schema.purchases)
      .values({
        userId: base.user.id,
        courseId: base.course.id,
        amountPaid: 3950,
        country: "IN",
        createdAt: daysBefore(2),
      })
      .returning()
      .get();

    expect(
      getNewestIndividualPurchase(db, base.user.id, base.course.id)
    ).toMatchObject({ id: newer.id, country: "IN" });
  });

  it("is nothing when the buyer holds only a Team Licence", () => {
    buySeats(base.user.id, 5);

    expect(
      getNewestIndividualPurchase(db, base.user.id, base.course.id)
    ).toBeNull();
  });

  it("is nothing for a Student who only claimed a Seat", () => {
    const teamAdmin = addStudent("Tess");
    const { seats } = buySeats(teamAdmin.id, 2);
    const student = addStudent("Sam");
    db.update(schema.coupons)
      .set({ redeemedByUserId: student.id, redeemedAt: daysBefore(1) })
      .where(eq(schema.coupons.id, seats[0].id))
      .run();

    expect(
      getNewestIndividualPurchase(db, student.id, base.course.id)
    ).toBeNull();
  });
});

describe("the refund offer on the course page", () => {
  it("offers the newest Individual Purchase, not a newer Team Licence", () => {
    const individual = buyForSelf(base.user.id, 3);
    buySeats(base.user.id, 5, 1);

    expect(getRefundOffer(db, base.user.id, base.course.id, NOW)).toMatchObject(
      {
        purchaseId: individual.id,
        amount: 7900,
      }
    );
  });

  it("offers nothing once the purchase has been refunded", async () => {
    const purchase = buyForSelf(base.user.id);
    const id = await raise(purchase.id, base.user.id);
    await approveRefundRequest(
      db,
      id,
      platformAdmin.id,
      null,
      NOW,
      notifications
    );

    expect(getRefundOffer(db, base.user.id, base.course.id, NOW)).toBeNull();
  });
});

describe("approving a Refund Request", () => {
  it("removes the buyer's Enrollment but keeps their progress", async () => {
    const purchase = buyForSelf(base.user.id);
    db.insert(schema.lessonProgress)
      .values({
        userId: base.user.id,
        lessonId: lessonIds[0],
        status: LessonProgressStatus.Completed,
      })
      .run();
    const id = await raise(purchase.id, base.user.id);

    const result = await approveRefundRequest(
      db,
      id,
      platformAdmin.id,
      null,
      NOW,
      notifications
    );

    expect(result.ok).toBe(true);
    expect(isEnrolled(base.user.id)).toBe(false);
    expect(
      db
        .select()
        .from(schema.lessonProgress)
        .where(eq(schema.lessonProgress.userId, base.user.id))
        .all()
    ).toHaveLength(1);

    const refundRequest = db
      .select()
      .from(schema.refunds)
      .where(eq(schema.refunds.id, id))
      .get();
    expect(refundRequest).toMatchObject({
      status: RefundStatus.Approved,
      amountRefunded: 7900,
      resolvedByUserId: platformAdmin.id,
    });
  });

  it("keeps the buyer's Bookmarks and Notes", async () => {
    const purchase = buyForSelf(base.user.id);
    toggleBookmark(db, base.user.id, lessonIds[0], NOW);
    saveNote(db, base.user.id, lessonIds[0], "Come back to this", NOW);
    const id = await raise(purchase.id, base.user.id);

    await approveRefundRequest(
      db,
      id,
      platformAdmin.id,
      null,
      NOW,
      notifications
    );

    expect(isEnrolled(base.user.id)).toBe(false);
    expect(isBookmarked(db, base.user.id, lessonIds[0])).toBe(true);
    expect(getNote(db, base.user.id, lessonIds[0])?.body).toBe(
      "Come back to this"
    );
  });

  it("keeps the buyer's Enrollment if they also hold a Claimed Seat for the course", async () => {
    const priya = addStudent("Priya");
    const { seats } = buySeats(priya.id, 2);
    // Liam claims a Seat first, so his Enrollment came from it.
    claimSeat(seats[0].id, base.user.id);
    const purchase = db
      .insert(schema.purchases)
      .values({
        userId: base.user.id,
        courseId: base.course.id,
        amountPaid: 7900,
        createdAt: daysBefore(2),
      })
      .returning()
      .get();
    const id = await raise(purchase.id, base.user.id);

    await approveRefundRequest(
      db,
      id,
      platformAdmin.id,
      null,
      NOW,
      notifications
    );

    expect(isEnrolled(base.user.id)).toBe(true);
  });

  it("makes a Team Licence's Unclaimed Seats unclaimable", async () => {
    const priya = addStudent("Priya");
    const { purchase, seats } = buySeats(priya.id, 2);
    const id = await raise(purchase.id, priya.id);

    const result = await approveRefundRequest(
      db,
      id,
      platformAdmin.id,
      null,
      NOW,
      notifications
    );

    expect(result.ok).toBe(true);
    for (const seat of seats) {
      expect(getSeatAvailability(db, getSeat(seat.id))).toBe("refunded");
    }
  });

  it("refuses a Team Licence whose Seat was claimed after the request", async () => {
    const priya = addStudent("Priya");
    const { purchase, seats } = buySeats(priya.id, 2);
    const id = await raise(purchase.id, priya.id);
    // Seats are on hold while Open, but older data can still hold a claim.
    claimSeat(seats[0].id, addStudent("Ben").id);

    expect(
      await approveRefundRequest(
        db,
        id,
        platformAdmin.id,
        null,
        NOW,
        notifications
      )
    ).toMatchObject({
      ok: false,
      status: 409,
    });
    expect(getSeatAvailability(db, getSeat(seats[1].id))).toBe("on_hold");
  });

  it("lets the first decision win", async () => {
    const purchase = buyForSelf(base.user.id);
    const id = await raise(purchase.id, base.user.id);
    await approveRefundRequest(
      db,
      id,
      platformAdmin.id,
      null,
      NOW,
      notifications
    );

    expect(
      await declineRefundRequest(
        db,
        id,
        platformAdmin.id,
        "Too late.",
        NOW,
        notifications
      )
    ).toMatchObject({
      ok: false,
      status: 409,
      error: "This refund request was already approved.",
    });
  });

  it("emails the buyer that the refund is on its way", async () => {
    const purchase = buyForSelf(base.user.id);
    const id = await raise(purchase.id, base.user.id);

    const result = await approveRefundRequest(
      db,
      id,
      platformAdmin.id,
      null,
      NOW,
      notifications
    );

    if (!result.ok) throw new Error(result.error);
    expect(result.email.to).toBe("test@example.com");
    expect(result.email.subject).toBe("Refund approved — Test Course");
    expect(result.email.body).toContain("$79.00");
  });
});

describe("declining a Refund Request", () => {
  it("needs a note", async () => {
    const purchase = buyForSelf(base.user.id);
    const id = await raise(purchase.id, base.user.id);

    expect(
      await declineRefundRequest(
        db,
        id,
        platformAdmin.id,
        "  ",
        NOW,
        notifications
      )
    ).toMatchObject({
      ok: false,
      status: 400,
    });
  });

  it("keeps the buyer's Enrollment and lets them raise a new Refund Request", async () => {
    const purchase = buyForSelf(base.user.id);
    const id = await raise(purchase.id, base.user.id);

    const result = await declineRefundRequest(
      db,
      id,
      platformAdmin.id,
      "You finished the course.",
      NOW,
      notifications
    );

    if (!result.ok) throw new Error(result.error);
    expect(result.email.body).toContain("You finished the course.");
    expect(isEnrolled(base.user.id)).toBe(true);
    expect(checkRefundRequest(db, purchase.id, base.user.id, NOW).ok).toBe(
      true
    );
  });

  it("frees a Team Licence's Seats again", async () => {
    const priya = addStudent("Priya");
    const { purchase, seats } = buySeats(priya.id, 1);
    const id = await raise(purchase.id, priya.id);
    expect(getSeatAvailability(db, getSeat(seats[0].id))).toBe("on_hold");

    await declineRefundRequest(
      db,
      id,
      platformAdmin.id,
      "Seats are in use.",
      NOW,
      notifications
    );

    expect(getSeatAvailability(db, getSeat(seats[0].id))).toBe("available");
  });
});

describe("listing Refund Requests", () => {
  it("shows a Platform Admin live figures and the rules a request breaks", async () => {
    const purchase = buyForSelf(base.user.id);
    const id = await raise(purchase.id, base.user.id);
    // Since raising the request, the buyer has finished half the course.
    db.insert(schema.lessonProgress)
      .values(
        lessonIds.slice(0, 2).map((lessonId) => ({
          userId: base.user.id,
          lessonId,
          status: LessonProgressStatus.Completed,
        }))
      )
      .run();

    const [row] = listRefundRequestsForReview(db, RefundStatus.Open, NOW);

    expect(row).toMatchObject({
      id,
      buyerName: "Test User",
      daysSincePurchase: 3,
      figures: {
        kind: "individual_purchase",
        lessonsCompleted: 2,
        lessonCount: 4,
      },
      ruleBreaks: ["completed_too_much"],
      canApprove: true,
    });
  });

  it("shows a Team Licence's Seats instead of the buyer's progress", async () => {
    const priya = addStudent("Priya");
    const { purchase } = buySeats(priya.id, 3);
    await raise(purchase.id, priya.id);

    const [row] = listRefundRequestsForReview(db, RefundStatus.Open, NOW);

    expect(row.figures).toEqual({
      kind: "team_licence",
      seatCount: 3,
      claimedSeatCount: 0,
    });
  });

  it("lists only the requested status, oldest first", async () => {
    const first = buyForSelf(base.user.id);
    const ben = addStudent("Ben");
    const second = buyForSelf(ben.id);
    const firstId = await raise(first.id, base.user.id);
    const secondId = await raiseRefundRequest(
      db,
      second.id,
      ben.id,
      "Changed my mind.",
      new Date(NOW.getTime() + 60_000),
      notifications
    );
    if (!secondId.ok) throw new Error(secondId.error);

    expect(
      listRefundRequestsForReview(db, RefundStatus.Open, NOW).map((r) => r.id)
    ).toEqual([firstId, secondId.refundRequestId]);

    await approveRefundRequest(
      db,
      firstId,
      platformAdmin.id,
      null,
      NOW,
      notifications
    );

    expect(
      listRefundRequestsForReview(db, RefundStatus.Approved, NOW)
    ).toMatchObject([{ id: firstId, decidedByName: "Pat Admin" }]);
  });

  it("shows a buyer their decided requests with the decline note", async () => {
    const purchase = buyForSelf(base.user.id);
    const id = await raise(purchase.id, base.user.id);
    await declineRefundRequest(
      db,
      id,
      platformAdmin.id,
      "Past half way.",
      NOW,
      notifications
    );

    expect(listRefundRequestsForBuyer(db, base.user.id)).toMatchObject([
      { id, status: RefundStatus.Declined, decisionNote: "Past half way." },
    ]);
  });

  it("lists a Team Admin's Team Licences and whether each can be refunded", () => {
    const priya = addStudent("Priya");
    buySeats(priya.id, 2);
    const { seats } = buySeats(priya.id, 2);
    claimSeat(seats[0].id, addStudent("Ben").id);

    expect(listTeamLicences(db, priya.id, NOW)).toMatchObject([
      { seatCount: 2, claimedSeatCount: 1, canRequestRefund: false },
      { seatCount: 2, claimedSeatCount: 0, canRequestRefund: true },
    ]);
  });
});

describe("the Refund Request Notifications", () => {
  const testUser = {
    name: "Test User",
    email: "test@example.com",
    avatarUrl: null,
  };

  function sentOf(kind: string) {
    return notifications.sent.filter((n) => n.kind === kind);
  }

  it("confirms the Refund Request to the buyer", async () => {
    const purchase = buyForSelf(base.user.id, 3, 7900);

    const id = await raise(purchase.id, base.user.id);

    expect(sentOf("refund-requested")).toEqual([
      {
        kind: "refund-requested",
        idempotencyKey: `refund-requested:${id}`,
        recipient: { id: base.user.id, ...testUser },
        data: {
          refundRequestId: id,
          courseTitle: "Test Course",
          amount: "$79.00",
        },
      },
    ]);
  });

  it("tells every Platform Admin, and nobody else, about the Open Refund Request", async () => {
    const sam = db
      .insert(schema.users)
      .values({
        name: "Sam Admin",
        email: "sam@example.com",
        role: UserRole.Admin,
      })
      .returning()
      .get();
    const purchase = buyForSelf(base.user.id, 3, 7900);

    const id = await raise(purchase.id, base.user.id);

    const open = sentOf("refund-request-open");
    expect(open.map((n) => n.recipient.id).sort()).toEqual(
      [platformAdmin.id, sam.id].sort()
    );
    expect(open[0]).toEqual({
      kind: "refund-request-open",
      idempotencyKey: `refund-request-open:${id}`,
      recipient: {
        id: platformAdmin.id,
        name: "Pat Admin",
        email: "pat@example.com",
        avatarUrl: null,
      },
      actor: { id: base.user.id, ...testUser },
      data: {
        refundRequestId: id,
        buyerName: "Test User",
        courseTitle: "Test Course",
        amount: "$79.00",
        reason: "It was not what I expected.",
        url: "/admin/refunds",
      },
    });
  });

  it("tells the buyer their Individual Purchase refund was approved", async () => {
    const purchase = buyForSelf(base.user.id, 3, 7900);
    const id = await raise(purchase.id, base.user.id);

    await approveRefundRequest(
      db,
      id,
      platformAdmin.id,
      "Sorry it didn't work out.",
      NOW,
      notifications
    );

    expect(sentOf("refund-approved")).toEqual([
      {
        kind: "refund-approved",
        idempotencyKey: `refund-approved:${id}`,
        recipient: { id: base.user.id, ...testUser },
        actor: {
          id: platformAdmin.id,
          name: "Pat Admin",
          email: "pat@example.com",
          avatarUrl: null,
        },
        data: {
          refundRequestId: id,
          courseTitle: "Test Course",
          purchaseKind: "individual_purchase",
          amount: "$79.00",
          decisionNote: "Sorry it didn't work out.",
          url: "/settings",
        },
      },
    ]);
  });

  it("tells a Team Admin their Team Licence refund was declined", async () => {
    const priya = addStudent("Priya");
    const { purchase } = buySeats(priya.id, 2);
    const id = await raise(purchase.id, priya.id);

    await declineRefundRequest(
      db,
      id,
      platformAdmin.id,
      "  Seats are in use.  ",
      NOW,
      notifications
    );

    expect(sentOf("refund-declined")).toEqual([
      {
        kind: "refund-declined",
        idempotencyKey: `refund-declined:${id}`,
        recipient: {
          id: priya.id,
          name: "Priya",
          email: "priya@example.com",
          avatarUrl: null,
        },
        actor: {
          id: platformAdmin.id,
          name: "Pat Admin",
          email: "pat@example.com",
          avatarUrl: null,
        },
        data: {
          refundRequestId: id,
          courseTitle: "Test Course",
          purchaseKind: "team_licence",
          amount: "$158.00",
          decisionNote: "Seats are in use.",
          url: "/team",
        },
      },
    ]);
    expect(sentOf("refund-approved")).toEqual([]);
  });

  it("tells a Team Admin their Team Licence refund was approved, with no note", async () => {
    const priya = addStudent("Priya");
    const { purchase } = buySeats(priya.id, 2);
    const id = await raise(purchase.id, priya.id);

    await approveRefundRequest(
      db,
      id,
      platformAdmin.id,
      null,
      NOW,
      notifications
    );

    expect(sentOf("refund-approved")).toMatchObject([
      {
        idempotencyKey: `refund-approved:${id}`,
        recipient: { id: priya.id },
        data: {
          purchaseKind: "team_licence",
          decisionNote: null,
          url: "/team",
        },
      },
    ]);
  });

  it("still raises and decides Refund Requests, with their emails, when Knock is down", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    notifications.failWith(new Error("Knock is down"));
    const purchase = buyForSelf(base.user.id);

    const raised = await raiseRefundRequest(
      db,
      purchase.id,
      base.user.id,
      "Nope.",
      NOW,
      notifications
    );
    if (!raised.ok) throw new Error(raised.error);
    const declined = await declineRefundRequest(
      db,
      raised.refundRequestId,
      platformAdmin.id,
      "No.",
      NOW,
      notifications
    );

    expect(raised.email.to).toBe("test@example.com");
    expect(declined).toMatchObject({
      ok: true,
      email: { to: "test@example.com" },
    });
    for (const key of [
      "refund-requested:",
      "refund-request-open:",
      "refund-declined:",
    ]) {
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining(key),
        "Knock is down"
      );
    }
    error.mockRestore();
  });

  it("sends nothing when a decision is refused", async () => {
    const purchase = buyForSelf(base.user.id);
    const id = await raise(purchase.id, base.user.id);
    await approveRefundRequest(
      db,
      id,
      platformAdmin.id,
      null,
      NOW,
      notifications
    );
    notifications.sent.length = 0;

    await declineRefundRequest(
      db,
      id,
      platformAdmin.id,
      "Too late.",
      NOW,
      notifications
    );

    expect(notifications.sent).toEqual([]);
  });
});
