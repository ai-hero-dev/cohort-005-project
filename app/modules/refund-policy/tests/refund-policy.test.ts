import { describe, expect, it } from "vitest";
import { RefundStatus } from "~/db/schema";
import { decideRefund, findRuleBreaks, type RefundFacts } from "../index";

// The refund policy, under test without a database for the first time. It
// used to live in `refunds.server.ts`, where reaching it meant building a
// database, seeding a Purchase and passing a `Date`.
//
// The purchase times below have no `Z`, so they are local time: the window
// counts the server's own calendar days.

const TODAY = "2026-03-15";
const clock = { today: () => TODAY };

type Progress = {
  lessonsCompleted?: number;
  lessonCount?: number;
  secondsWatched?: number;
};

function individual(progress: Progress = {}): RefundFacts["figures"] {
  return {
    kind: "individual_purchase",
    lessonsCompleted: 0,
    lessonCount: 10,
    secondsWatched: 0,
    ...progress,
  };
}

function facts(overrides: Partial<RefundFacts> = {}): RefundFacts {
  return {
    purchasedAt: "2026-03-10T09:00:00",
    amountPaidCents: 4_000,
    figures: individual(),
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
        refusedBy: "window_closed",
        message: "The 14-day window has closed.",
      });
    });
  });

  describe("under half the course completed", () => {
    it("allows a refund one lesson short of half", () => {
      expect(
        decide({ figures: individual({ lessonsCompleted: 4 }) }).eligible
      ).toBe(true);
    });

    it("refuses at exactly half", () => {
      expect(
        decide({ figures: individual({ lessonsCompleted: 5 }) })
      ).toMatchObject({ refusedBy: "completed_too_much" });
    });

    it("refuses past half", () => {
      expect(
        decide({ figures: individual({ lessonCount: 3, lessonsCompleted: 2 }) })
      ).toMatchObject({ refusedBy: "completed_too_much" });
    });

    it("allows a refund on a course with no lessons at all", () => {
      // Nothing divided by nothing is not half of anything.
      expect(
        decide({ figures: individual({ lessonCount: 0, lessonsCompleted: 0 }) })
          .eligible
      ).toBe(true);
    });

    it("refuses a buyer who has finished the whole course", () => {
      expect(decide({ figures: individual({ lessonsCompleted: 10 }) })).toEqual(
        {
          eligible: false,
          refusedBy: "completed_too_much",
          message:
            "You have completed too much of this course to request a refund.",
        }
      );
    });
  });

  describe("under the watch limit", () => {
    it("allows a refund one second short of an hour", () => {
      expect(
        decide({ figures: individual({ secondsWatched: 3_599 }) }).eligible
      ).toBe(true);
    });

    it("refuses at exactly an hour", () => {
      expect(
        decide({ figures: individual({ secondsWatched: 3_600 }) })
      ).toMatchObject({ refusedBy: "watched_too_much" });
    });
  });

  describe("no seat claimed", () => {
    it("refuses a Team Licence with a claimed seat against it", () => {
      expect(
        decide({
          figures: { kind: "team_licence", seatCount: 3, claimedSeatCount: 1 },
        })
      ).toEqual({
        eligible: false,
        refusedBy: "seat_claimed",
        message: "A Team Licence with a claimed Seat cannot be refunded.",
      });
    });

    it("allows a Team Licence whose seats are all unclaimed", () => {
      expect(
        decide({
          figures: { kind: "team_licence", seatCount: 3, claimedSeatCount: 0 },
        }).eligible
      ).toBe(true);
    });
  });

  describe("the amount given back", () => {
    it("gives back exactly what the buyer paid", () => {
      expect(decide({ amountPaidCents: 2_950 })).toMatchObject({
        refundableCents: 2_950,
      });
    });
  });

  describe("a refund already on the purchase", () => {
    it("refuses a second request on the same purchase", () => {
      expect(
        decide({ existingRefunds: [{ status: RefundStatus.Open }] })
      ).toEqual({
        eligible: false,
        refusedBy: "already_requested",
        message: "You already have an open refund request on this purchase.",
      });
    });

    it("refuses a purchase that has already been refunded", () => {
      expect(
        decide({ existingRefunds: [{ status: RefundStatus.Approved }] })
      ).toEqual({
        eligible: false,
        refusedBy: "already_refunded",
        message: "This purchase has already been refunded.",
      });
    });

    it("lets a buyer ask again after a declined refund", () => {
      expect(
        decide({ existingRefunds: [{ status: RefundStatus.Declined }] })
          .eligible
      ).toBe(true);
    });

    it("says so before it says anything about the window", () => {
      expect(
        decide({
          existingRefunds: [{ status: RefundStatus.Open }],
          purchasedAt: "2026-01-01T09:00:00",
        })
      ).toMatchObject({ refusedBy: "already_requested" });
    });
  });

  describe("which refusal the buyer is shown", () => {
    it("reports the closed window ahead of the completion", () => {
      expect(
        decide({
          purchasedAt: "2026-01-01T09:00:00",
          figures: individual({ lessonsCompleted: 10 }),
        })
      ).toMatchObject({ refusedBy: "window_closed" });
    });

    it("reports the watch limit ahead of the completion", () => {
      expect(
        decide({
          figures: individual({ lessonsCompleted: 10, secondsWatched: 99_999 }),
        })
      ).toMatchObject({ refusedBy: "watched_too_much" });
    });
  });
});

describe("findRuleBreaks", () => {
  it("lists every condition a purchase fails, not just the first", () => {
    expect(
      findRuleBreaks(
        facts({
          purchasedAt: "2026-01-01T09:00:00",
          figures: individual({ lessonsCompleted: 10, secondsWatched: 99_999 }),
        }),
        clock
      )
    ).toEqual(["window_closed", "watched_too_much", "completed_too_much"]);
  });

  it("judges the window on the day the clock gives it", () => {
    const lateRequest = facts({ purchasedAt: "2026-02-28T09:00:00" });
    const raisedOnTheLastDay = { today: () => "2026-03-14" };

    expect(findRuleBreaks(lateRequest, clock)).toEqual(["window_closed"]);
    expect(findRuleBreaks(lateRequest, raisedOnTheLastDay)).toEqual([]);
  });
});
