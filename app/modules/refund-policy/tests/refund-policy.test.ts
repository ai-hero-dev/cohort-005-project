import { describe, expect, it } from "vitest";
import { RefundStatus } from "~/db/schema";
import { decideRefund, type RefundFacts } from "../index";

// The refund policy, under test for the first time. It used to live in a
// loader and an action, where reaching it meant building a `Request`, a
// router context and a database. The four conditions below were never
// checked by anything but a person clicking through the app.
//
// The purchase times below have no `Z`, so they are local time: the window
// counts the server's own calendar days.

const TODAY = "2026-03-15";
const clock = { today: () => TODAY };

function facts(overrides: Partial<RefundFacts> = {}): RefundFacts {
  return {
    purchasedAt: "2026-03-10T09:00:00",
    amountPaidCents: 4_000,
    lessonCount: 10,
    completedLessonCount: 0,
    watchedSeconds: 0,
    hasClaimedSeat: false,
    existingRefunds: [],
    ...overrides,
  };
}

function decide(overrides: Partial<RefundFacts> = {}) {
  return decideRefund(facts(overrides), clock);
}

describe("decideRefund", () => {
  it("allows a refund when all four conditions are met", () => {
    expect(decide()).toEqual({
      eligible: true,
      refundableCents: 4_000,
      lastDayInWindow: "2026-03-24",
      daysLeft: 9,
    });
  });

  describe("the fourteen-day window", () => {
    it("allows a refund on the last day of the window", () => {
      const decision = decide({ purchasedAt: "2026-03-01T09:00:00" });

      expect(decision.eligible).toBe(true);
      expect(decision).toMatchObject({ daysLeft: 0 });
    });

    it("gives a purchase at 23:00 the whole of its fourteenth day", () => {
      expect(decide({ purchasedAt: "2026-03-01T23:45:00" }).eligible).toBe(
        true
      );
    });

    it("refuses the day after the window closes", () => {
      expect(decide({ purchasedAt: "2026-02-28T09:00:00" })).toEqual({
        eligible: false,
        refusedBy: "window-closed",
        message: "The 14-day window has closed.",
      });
    });
  });

  describe("under half the course completed", () => {
    it("allows a refund one lesson short of half", () => {
      expect(
        decide({ lessonCount: 10, completedLessonCount: 4 }).eligible
      ).toBe(true);
    });

    it("refuses at exactly half", () => {
      expect(
        decide({ lessonCount: 10, completedLessonCount: 5 })
      ).toMatchObject({ refusedBy: "too-much-completed" });
    });

    it("refuses past half", () => {
      expect(decide({ lessonCount: 3, completedLessonCount: 2 })).toMatchObject(
        { refusedBy: "too-much-completed" }
      );
    });

    it("allows a refund on a course with no lessons at all", () => {
      // Nothing divided by nothing is not half of anything.
      expect(decide({ lessonCount: 0, completedLessonCount: 0 }).eligible).toBe(
        true
      );
    });

    // This is the condition the refund action never checked. Before this
    // module, a Learner who had finished the whole course was not offered the
    // button and could still post the form.
    it("refuses a learner who has finished the whole course", () => {
      expect(
        decide({ lessonCount: 10, completedLessonCount: 10 })
      ).toMatchObject({ refusedBy: "too-much-completed" });
    });
  });

  describe("under the watch limit", () => {
    it("allows a refund one second short of an hour", () => {
      expect(decide({ watchedSeconds: 3_599 }).eligible).toBe(true);
    });

    it("refuses at exactly an hour", () => {
      expect(decide({ watchedSeconds: 3_600 })).toMatchObject({
        refusedBy: "too-much-watched",
      });
    });
  });

  describe("no seat claimed", () => {
    it("refuses a purchase with a claimed seat against it", () => {
      expect(decide({ hasClaimedSeat: true })).toEqual({
        eligible: false,
        refusedBy: "seat-claimed",
        message: "A claimed team seat cannot be refunded.",
      });
    });
  });

  describe("the amount given back", () => {
    it("gives back exactly what the learner paid", () => {
      expect(decide({ amountPaidCents: 2_950 })).toMatchObject({
        refundableCents: 2_950,
      });
    });
  });

  describe("a refund already on the purchase", () => {
    it("refuses a second request on the same purchase", () => {
      expect(
        decide({ existingRefunds: [{ status: RefundStatus.Requested }] })
      ).toEqual({
        eligible: false,
        refusedBy: "already-requested",
        message: "You already have a request open on this purchase.",
      });
    });

    it("refuses a purchase that has already been refunded", () => {
      expect(
        decide({ existingRefunds: [{ status: RefundStatus.Approved }] })
      ).toEqual({
        eligible: false,
        refusedBy: "already-refunded",
        message: "This purchase has already been refunded.",
      });
    });

    it("lets a learner ask again after a declined refund", () => {
      expect(
        decide({ existingRefunds: [{ status: RefundStatus.Declined }] })
          .eligible
      ).toBe(true);
    });

    it("says so before it says anything about the window", () => {
      expect(
        decide({
          existingRefunds: [{ status: RefundStatus.Requested }],
          purchasedAt: "2026-01-01T09:00:00",
        })
      ).toMatchObject({ refusedBy: "already-requested" });
    });
  });

  describe("which refusal the learner is shown", () => {
    it("reports the closed window ahead of the completion", () => {
      expect(
        decide({
          purchasedAt: "2026-01-01T09:00:00",
          completedLessonCount: 10,
        })
      ).toMatchObject({ refusedBy: "window-closed" });
    });

    it("reports the completion ahead of the watch limit", () => {
      expect(
        decide({ completedLessonCount: 10, watchedSeconds: 99_999 })
      ).toMatchObject({ refusedBy: "too-much-completed" });
    });

    it("reports the watch limit ahead of the claimed seat", () => {
      expect(
        decide({ watchedSeconds: 99_999, hasClaimedSeat: true })
      ).toMatchObject({ refusedBy: "too-much-watched" });
    });
  });
});
