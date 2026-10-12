import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import { eq } from "drizzle-orm";
import * as schema from "~/db/schema";
import {
  getFeedPreferences,
  setFeedPreference,
  visibleNotificationCategories,
  syncAllUsers,
  syncUser,
} from "./notification-preferences.server";
import {
  fakeNotifications,
  type FakeNotifications,
} from "./notifications.fake.server";

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let notifications: FakeNotifications;

beforeEach(() => {
  notifications = fakeNotifications();
  db = createTestDb();
  base = seedBaseData(db);
});

function person(user: typeof schema.users.$inferSelect) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
  };
}

describe("syncing a user", () => {
  it("sends their name, email and avatar", async () => {
    await syncUser(notifications, {
      id: 7,
      name: "Ada",
      email: "ada@example.com",
      avatarUrl: "https://example.com/ada.png",
    });

    expect(notifications.users.get(7)).toEqual({
      id: 7,
      name: "Ada",
      email: "ada@example.com",
      avatarUrl: "https://example.com/ada.png",
    });
  });

  it("writes the default preferences for a user with none: Enrollments off, everything else on", async () => {
    await syncUser(notifications, person(base.user));

    expect(notifications.preferences.get(base.user.id)).toEqual({
      refundRequestUpdates: { feed: true },
      seatClaims: { feed: true },
      enrollments: { feed: false },
      discussionQuestions: { feed: true },
      openRefundRequests: { feed: true },
      discussionReplies: { feed: true },
    });
  });

  it("writes the default preferences for a user whose set is empty", async () => {
    await notifications.mergePreferences(base.user.id, {});

    await syncUser(notifications, person(base.user));

    expect(notifications.preferences.get(base.user.id)).toMatchObject({
      enrollments: { feed: false },
      discussionReplies: { feed: true },
    });
  });

  it("leaves an existing preference set alone", async () => {
    await notifications.mergePreferences(base.user.id, {
      discussionReplies: { feed: false },
      enrollments: { feed: true },
    });

    await syncUser(notifications, person(base.user));

    expect(notifications.preferences.get(base.user.id)).toEqual({
      discussionReplies: { feed: false },
      enrollments: { feed: true },
    });
  });

  it("logs a failed sync instead of throwing", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    notifications.failWith(new Error("Knock is down"));

    await expect(
      syncUser(notifications, person(base.user))
    ).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining(`sync user ${base.user.id}`),
      "Knock is down"
    );
    error.mockRestore();
  });
});

describe("syncing every user", () => {
  it("syncs each user in the database and reports how many", async () => {
    const count = await syncAllUsers(db, notifications);

    expect(count).toBe(2);
    expect([...notifications.users.keys()].sort()).toEqual(
      [base.user.id, base.instructor.id].sort()
    );
    expect(notifications.preferences.get(base.instructor.id)).toMatchObject({
      enrollments: { feed: false },
    });
  });
});

describe("changing a feed preference", () => {
  it("merges the change into the existing set, leaving every other preference unchanged", async () => {
    await notifications.mergePreferences(base.user.id, {
      refundRequestUpdates: { feed: false },
      enrollments: { feed: true },
      discussionReplies: { feed: true },
    });

    await setFeedPreference(
      notifications,
      base.user.id,
      "discussionReplies",
      false
    );

    expect(notifications.preferences.get(base.user.id)).toEqual({
      refundRequestUpdates: { feed: false },
      enrollments: { feed: true },
      discussionReplies: { feed: false },
    });
  });

  it("starts from the defaults when the user has no set yet", async () => {
    await setFeedPreference(notifications, base.user.id, "enrollments", true);

    expect(notifications.preferences.get(base.user.id)).toEqual({
      refundRequestUpdates: { feed: true },
      seatClaims: { feed: true },
      enrollments: { feed: true },
      discussionQuestions: { feed: true },
      openRefundRequests: { feed: true },
      discussionReplies: { feed: true },
    });
  });

  it("starts from the defaults when the user's set is empty", async () => {
    await notifications.mergePreferences(base.user.id, {});

    await setFeedPreference(notifications, base.user.id, "enrollments", true);

    expect(notifications.preferences.get(base.user.id)).toEqual({
      refundRequestUpdates: { feed: true },
      seatClaims: { feed: true },
      enrollments: { feed: true },
      discussionQuestions: { feed: true },
      openRefundRequests: { feed: true },
      discussionReplies: { feed: true },
    });
  });

  it("is read back as each category's feed switch, with defaults for missing ones", async () => {
    await notifications.mergePreferences(base.user.id, {
      discussionReplies: { feed: false },
    });

    expect(await getFeedPreferences(notifications, base.user.id)).toEqual({
      refundRequestUpdates: true,
      seatClaims: true,
      enrollments: false,
      discussionQuestions: true,
      openRefundRequests: true,
      discussionReplies: false,
    });
  });
});

describe("which switches a person sees", () => {
  function buyIndividually(userId: number) {
    return db
      .insert(schema.purchases)
      .values({ userId, courseId: base.course.id, amountPaid: 4900 })
      .returning()
      .get();
  }

  function buyTeamLicence(userId: number) {
    const purchase = buyIndividually(userId);
    const team = db.insert(schema.teams).values({}).returning().get();
    db.insert(schema.coupons)
      .values({
        teamId: team.id,
        courseId: base.course.id,
        code: `SEAT-${purchase.id}`,
        purchaseId: purchase.id,
      })
      .run();
  }

  function addUser(name: string, role: schema.UserRole) {
    return db
      .insert(schema.users)
      .values({ name, email: `${name}@example.com`, role })
      .returning()
      .get();
  }

  it("shows a Student with nothing only Discussion Replies", () => {
    expect(visibleNotificationCategories(db, base.user.id)).toEqual([
      "discussionReplies",
    ]);
  });

  it("adds Refund Request updates once they have a Purchase", () => {
    buyIndividually(base.user.id);

    expect(visibleNotificationCategories(db, base.user.id)).toEqual([
      "refundRequestUpdates",
      "discussionReplies",
    ]);
  });

  it("adds Seat claims for a Team Admin on a Team Licence", () => {
    buyTeamLicence(base.user.id);

    expect(visibleNotificationCategories(db, base.user.id)).toEqual([
      "refundRequestUpdates",
      "seatClaims",
      "discussionReplies",
    ]);
  });

  it("adds Enrollments and Discussion Questions for someone who owns a course", () => {
    expect(visibleNotificationCategories(db, base.instructor.id)).toEqual([
      "enrollments",
      "discussionQuestions",
      "discussionReplies",
    ]);
  });

  it("hides Enrollments and Discussion Questions from an Instructor who owns no course", () => {
    const instructor = addUser("Ines", schema.UserRole.Instructor);

    expect(visibleNotificationCategories(db, instructor.id)).toEqual([
      "discussionReplies",
    ]);
  });

  it("treats a Platform Admin who owns a course as an Instructor too", () => {
    const admin = addUser("Alex", schema.UserRole.Admin);
    db.update(schema.courses)
      .set({ instructorId: admin.id })
      .where(eq(schema.courses.id, base.course.id))
      .run();

    expect(visibleNotificationCategories(db, admin.id)).toEqual([
      "enrollments",
      "discussionQuestions",
      "openRefundRequests",
      "discussionReplies",
    ]);
  });

  it("adds Open Refund Requests for a Platform Admin", () => {
    const admin = addUser("Alex", schema.UserRole.Admin);

    expect(visibleNotificationCategories(db, admin.id)).toEqual([
      "openRefundRequests",
      "discussionReplies",
    ]);
  });
});
