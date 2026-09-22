import { describe, expect, it } from "vitest";
import { decideRefund, type RefundFacts } from "../index";

// The Refund Policy, under test for the first time. It used to live in a
// loader and an action, where reaching it meant building a `Request`, a
// router context and a database. The five conditions below were never
// checked by anything but a person clicking through the app.

const NOW = new Date("2026-03-15T12:00:00.000Z");
const nothingIsDiscounted = () => false;
const everythingIsDiscounted = () => true;

function facts(overrides: Partial<RefundFacts> = {}): RefundFacts {
  return {
    purchasedAt: "2026-03-10T09:00:00.000Z",
    amountPaidCents: 4_000,
    listPriceCents: 10_000,
    country: "GB",
    lessonCount: 10,
    completedLessonCount: 0,
    watchedSeconds: 0,
    hasClaimedSeat: false,
    hasOpenRefund: false,
    ...overrides,
  };
}

function decide(overrides: Partial<RefundFacts> = {}) {
  return decideRefund(facts(overrides), nothingIsDiscounted, NOW);
}

describe("decideRefund", () => {
  it("allows a refund when all five conditions are met", () => {
    expect(decide()).toEqual({
      eligible: true,
      refundableCents: 10_000,
      lastDayInWindow: "2026-03-24",
      daysLeft: 9,
    });
  });

  describe("the fourteen-day window", () => {
    it("allows a refund on the last day of the window", () => {
      const decision = decide({ purchasedAt: "2026-03-01T09:00:00.000Z" });

      expect(decision.eligible).toBe(true);
      expect(decision).toMatchObject({ daysLeft: 0 });
    });

    it("gives a purchase at 23:00 the whole of its fourteenth day", () => {
      expect(decide({ purchasedAt: "2026-03-01T23:45:00.000Z" }).eligible).toBe(
        true
      );
    });

    it("refuses the day after the window closes", () => {
      expect(decide({ purchasedAt: "2026-02-28T09:00:00.000Z" })).toEqual({
        eligible: false,
        refusedBy: "window-closed",
        message: "The 14-day refund window has closed.",
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

  describe("under two hours watched", () => {
    it("allows a refund one second short of two hours", () => {
      expect(decide({ watchedSeconds: 7_199 }).eligible).toBe(true);
    });

    it("refuses at exactly two hours", () => {
      expect(decide({ watchedSeconds: 7_200 })).toMatchObject({
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
    it("gives back the list price when the learner paid it", () => {
      const decision = decideRefund(
        facts({ amountPaidCents: 10_000, listPriceCents: 10_000 }),
        nothingIsDiscounted,
        NOW
      );

      expect(decision).toMatchObject({ refundableCents: 10_000 });
    });

    it("gives back the regional price the learner actually paid", () => {
      const decision = decideRefund(
        facts({ amountPaidCents: 4_000, listPriceCents: 10_000 }),
        everythingIsDiscounted,
        NOW
      );

      expect(decision).toMatchObject({ refundableCents: 4_000 });
    });

    it("asks about the country the purchase was made from", () => {
      const asked: (string | null)[] = [];

      decideRefund(
        facts({ country: "IN" }),
        (country) => {
          asked.push(country);
          return false;
        },
        NOW
      );

      expect(asked).toEqual(["IN"]);
    });
  });

  describe("a refund already open", () => {
    it("refuses a second request on the same purchase", () => {
      expect(decide({ hasOpenRefund: true })).toEqual({
        eligible: false,
        refusedBy: "refund-already-open",
        message: "You already have a refund open on this purchase.",
      });
    });

    it("says so before it says anything about the window", () => {
      expect(
        decide({
          hasOpenRefund: true,
          purchasedAt: "2026-01-01T09:00:00.000Z",
        })
      ).toMatchObject({ refusedBy: "refund-already-open" });
    });
  });

  describe("which refusal the learner is shown", () => {
    it("reports the closed window ahead of the completion", () => {
      expect(
        decide({
          purchasedAt: "2026-01-01T09:00:00.000Z",
          completedLessonCount: 10,
        })
      ).toMatchObject({ refusedBy: "window-closed" });
    });

    it("reports the completion ahead of the watch time", () => {
      expect(
        decide({ completedLessonCount: 10, watchedSeconds: 99_999 })
      ).toMatchObject({ refusedBy: "too-much-completed" });
    });

    it("reports the watch time ahead of the claimed seat", () => {
      expect(
        decide({ watchedSeconds: 99_999, hasClaimedSeat: true })
      ).toMatchObject({ refusedBy: "too-much-watched" });
    });
  });
});
