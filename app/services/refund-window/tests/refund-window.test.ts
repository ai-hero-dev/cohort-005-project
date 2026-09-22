import { describe, expect, it } from "vitest";
import {
  REFUND_WINDOW_DAYS,
  daysLeftInRefundWindow,
  isWithinRefundWindow,
  lastDayOfRefundWindow,
  summariseRefundExposure,
  type PurchaseInWindow,
} from "../index";

// One module, one test file. The day arithmetic under the window used to be a
// module of its own with tests of its own — `addDays` and `daysBetween`, an
// interface nobody but this module ever called. Those tests are here now, and
// they go through the window rather than around it: a month end and a leap day
// are things the window has to get right, not facts about a helper.
//
// The oldest tests in this file are still the first tests in this repository
// that could not have been written before. The arithmetic used to sit inside
// the analytics loader, where today came from `new Date()` and the rows came
// from the database, so there was nothing to call. Here the moment is an
// argument.

const TODAY = "2026-03-15";

function at(day: string): Date {
  return new Date(`${day}T12:00:00.000Z`);
}

function purchase(overrides: Partial<PurchaseInWindow> = {}): PurchaseInWindow {
  return {
    courseId: 1,
    courseTitle: "TypeScript, end to end",
    amountPaidCents: 10_000,
    purchasedAt: "2026-03-15T09:00:00.000Z",
    ...overrides,
  };
}

function summarise(
  purchases: PurchaseInWindow[],
  totalGrossCents = 100_000,
  today = TODAY
) {
  return summariseRefundExposure({
    purchases,
    totalGrossCents,
    now: at(today),
  });
}

describe("summariseRefundExposure", () => {
  it("reports nothing at risk when there are no purchases", () => {
    expect(summarise([])).toEqual({
      grossCents: 0,
      netCents: 0,
      purchaseCount: 0,
      sharePercent: 0,
      closingTodayCount: 0,
      courses: [],
    });
  });

  it("counts a purchase made today as fully exposed", () => {
    const exposure = summarise([purchase()]);

    expect(exposure.grossCents).toBe(10_000);
    expect(exposure.purchaseCount).toBe(1);
    expect(exposure.courses[0]?.daysLeft).toBe(REFUND_WINDOW_DAYS);
  });

  it("keeps a purchase made on the last day of the window", () => {
    const exposure = summarise([
      purchase({ purchasedAt: "2026-03-01T09:00:00.000Z" }),
    ]);

    expect(exposure.purchaseCount).toBe(1);
    expect(exposure.courses[0]?.daysLeft).toBe(0);
  });

  it("drops a purchase one day past the window", () => {
    const exposure = summarise([
      purchase({ purchasedAt: "2026-02-28T09:00:00.000Z" }),
    ]);

    expect(exposure.purchaseCount).toBe(0);
    expect(exposure.grossCents).toBe(0);
    expect(exposure.courses).toEqual([]);
  });

  it("gives a purchase made at 23:00 the whole of its fourteenth day", () => {
    // Bought late on the 1st; the window's last day is the 15th, and it is
    // the 15th now. Counting in hours would have closed this one already.
    const exposure = summarise([
      purchase({ purchasedAt: "2026-03-01T23:30:00.000Z" }),
    ]);

    expect(exposure.purchaseCount).toBe(1);
    expect(exposure.courses[0]?.daysLeft).toBe(0);
  });

  it("closes the window the day after the last day, not a day later", () => {
    const purchases = [purchase({ purchasedAt: "2026-03-01T09:00:00.000Z" })];

    expect(summarise(purchases, 100_000, "2026-03-15").purchaseCount).toBe(1);
    expect(summarise(purchases, 100_000, "2026-03-16").purchaseCount).toBe(0);
  });

  it("counts the purchases that leave the window today", () => {
    const exposure = summarise([
      purchase({ purchasedAt: "2026-03-01T09:00:00.000Z" }),
      purchase({ purchasedAt: "2026-03-01T22:00:00.000Z" }),
      purchase({ purchasedAt: "2026-03-10T09:00:00.000Z" }),
    ]);

    expect(exposure.closingTodayCount).toBe(2);
  });

  it("reports nothing closing today when the soonest has days to run", () => {
    const exposure = summarise([
      purchase({ purchasedAt: "2026-03-02T09:00:00.000Z" }),
    ]);

    expect(exposure.closingTodayCount).toBe(0);
    expect(exposure.courses[0]?.daysLeft).toBe(1);
  });

  it("splits the exposed gross into the instructor's net", () => {
    const exposure = summarise([purchase({ amountPaidCents: 5_000 })]);

    expect(exposure.netCents).toBe(4_000);
  });

  it("groups purchases by course and sums what each has at risk", () => {
    const exposure = summarise([
      purchase({ courseId: 1, courseTitle: "One", amountPaidCents: 1_000 }),
      purchase({ courseId: 1, courseTitle: "One", amountPaidCents: 2_000 }),
      purchase({ courseId: 2, courseTitle: "Two", amountPaidCents: 500 }),
    ]);

    expect(exposure.courses).toEqual([
      {
        courseId: 1,
        title: "One",
        grossCents: 3_000,
        purchaseCount: 2,
        daysLeft: REFUND_WINDOW_DAYS,
      },
      {
        courseId: 2,
        title: "Two",
        grossCents: 500,
        purchaseCount: 1,
        daysLeft: REFUND_WINDOW_DAYS,
      },
    ]);
  });

  it("orders courses by what they have at risk, biggest first", () => {
    const exposure = summarise([
      purchase({ courseId: 1, courseTitle: "Small", amountPaidCents: 100 }),
      purchase({ courseId: 2, courseTitle: "Big", amountPaidCents: 900 }),
      purchase({ courseId: 3, courseTitle: "Middle", amountPaidCents: 500 }),
    ]);

    expect(exposure.courses.map((course) => course.title)).toEqual([
      "Big",
      "Middle",
      "Small",
    ]);
  });

  it("headlines a course with its most urgent purchase, not its newest", () => {
    const exposure = summarise([
      purchase({ purchasedAt: "2026-03-14T09:00:00.000Z" }),
      purchase({ purchasedAt: "2026-03-02T09:00:00.000Z" }),
    ]);

    expect(exposure.courses[0]?.daysLeft).toBe(1);
  });

  it("ignores a closed purchase when headlining a course", () => {
    const exposure = summarise([
      purchase({ purchasedAt: "2026-01-01T09:00:00.000Z" }),
      purchase({ purchasedAt: "2026-03-10T09:00:00.000Z" }),
    ]);

    expect(exposure.purchaseCount).toBe(1);
    expect(exposure.courses[0]?.daysLeft).toBe(9);
  });

  it("states the exposure as a share of the gross it came from", () => {
    const exposure = summarise([purchase({ amountPaidCents: 2_500 })], 10_000);

    expect(exposure.sharePercent).toBe(25);
  });

  it("rounds the share to a whole percent", () => {
    const exposure = summarise([purchase({ amountPaidCents: 1 })], 300);

    expect(exposure.sharePercent).toBe(0);
  });

  it("reports a zero share rather than dividing by zero", () => {
    const exposure = summarise([], 0);

    expect(exposure.sharePercent).toBe(0);
  });

  it("does not mutate the purchases it was given", () => {
    const purchases = [purchase()];
    const before = structuredClone(purchases);

    summarise(purchases);

    expect(purchases).toEqual(before);
  });

  it("treats a purchase timestamped in the future as still exposed", () => {
    // Clock skew between the writer and the reader. The money has not been
    // kept, so it belongs in the figure.
    const exposure = summarise([
      purchase({ purchasedAt: "2026-03-16T09:00:00.000Z" }),
    ]);

    expect(exposure.purchaseCount).toBe(1);
  });
});

describe("lastDayOfRefundWindow", () => {
  it("is fourteen whole days after the purchase", () => {
    expect(lastDayOfRefundWindow("2026-03-01T09:00:00.000Z")).toBe(
      "2026-03-15"
    );
  });

  it("ignores the time of day the purchase was made at", () => {
    expect(lastDayOfRefundWindow("2026-03-01T23:45:00.000Z")).toBe(
      "2026-03-15"
    );
  });

  it("crosses a month end", () => {
    expect(lastDayOfRefundWindow("2026-02-25T09:00:00.000Z")).toBe(
      "2026-03-11"
    );
  });

  it("crosses a leap day", () => {
    expect(lastDayOfRefundWindow("2028-02-20T09:00:00.000Z")).toBe(
      "2028-03-05"
    );
  });

  it("crosses a year end", () => {
    expect(lastDayOfRefundWindow("2026-12-25T09:00:00.000Z")).toBe(
      "2027-01-08"
    );
  });
});

describe("isWithinRefundWindow", () => {
  const purchasedAt = "2026-03-01T09:00:00.000Z";

  it("is open on the day of the purchase", () => {
    expect(isWithinRefundWindow(purchasedAt, at("2026-03-01"))).toBe(true);
  });

  it("is open on the last day of the window", () => {
    expect(isWithinRefundWindow(purchasedAt, at("2026-03-15"))).toBe(true);
  });

  it("is open at one second to midnight on the last day", () => {
    expect(
      isWithinRefundWindow(purchasedAt, new Date("2026-03-15T23:59:59.000Z"))
    ).toBe(true);
  });

  it("is closed the next morning", () => {
    expect(
      isWithinRefundWindow(purchasedAt, new Date("2026-03-16T00:00:01.000Z"))
    ).toBe(false);
  });
});

describe("daysLeftInRefundWindow", () => {
  const purchasedAt = "2026-03-01T09:00:00.000Z";

  it("is the whole window on the day of the purchase", () => {
    expect(daysLeftInRefundWindow(purchasedAt, at("2026-03-01"))).toBe(
      REFUND_WINDOW_DAYS
    );
  });

  it("counts down a day at a time", () => {
    expect(daysLeftInRefundWindow(purchasedAt, at("2026-03-14"))).toBe(1);
  });

  it("is zero on the last day", () => {
    expect(daysLeftInRefundWindow(purchasedAt, at("2026-03-15"))).toBe(0);
  });

  it("does not go negative once the window has closed", () => {
    expect(daysLeftInRefundWindow(purchasedAt, at("2026-04-01"))).toBe(0);
  });

  it("counts across a month end", () => {
    expect(
      daysLeftInRefundWindow("2026-02-25T09:00:00.000Z", at("2026-03-01"))
    ).toBe(10);
  });
});
