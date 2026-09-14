import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  ANALYTICS_RANGES,
  DEFAULT_ANALYTICS_RANGE,
  PLATFORM_FEE_PERCENT,
  PLATFORM_FEE_RATE,
  formatBucket,
  formatMoney,
  rangeStart,
  parseAnalyticsRange,
  splitRevenue,
} from "./analytics";

describe("analytics config", () => {
  describe("the platform fee", () => {
    it("states the same rate as a fraction and as a percentage", () => {
      // The page prints the percentage next to amounts that it calculates
      // from the fraction. The two values must agree.
      expect(PLATFORM_FEE_RATE).toBe(0.2);
      expect(PLATFORM_FEE_PERCENT).toBe(20);
    });
  });

  describe("ANALYTICS_RANGES", () => {
    it("offers each window, labelled, in the order they are shown", () => {
      // The label is the only place that gives the length of a window to a
      // reader. Pin it here, and do not rely on a visual check.
      expect(ANALYTICS_RANGES).toEqual([
        { value: "7d", label: "Last 7 days" },
        { value: "30d", label: "Last 30 days" },
        { value: "90d", label: "Last 90 days" },
        { value: "all", label: "All time" },
      ]);
    });

    it("labels each day window with the number of days it covers", () => {
      // This rule also applies to a range that someone adds later, which the
      // exact table above cannot do. It finds the error where "7d" has the
      // label "Last 9 days": the label must agree with its token.
      for (const { value, label } of ANALYTICS_RANGES) {
        if (value === "all") continue;
        expect(label).toBe(`Last ${value.replace("d", "")} days`);
      }
    });

    it("defaults to a window it actually offers", () => {
      expect(DEFAULT_ANALYTICS_RANGE).toBe("30d");
      expect(ANALYTICS_RANGES.map((range) => range.value)).toContain(
        DEFAULT_ANALYTICS_RANGE
      );
    });
  });

  describe("splitRevenue", () => {
    it("splits a round amount into fee and net", () => {
      expect(splitRevenue(10000)).toEqual({
        grossCents: 10000,
        feeCents: 2000,
        netCents: 8000,
      });
    });

    it("keeps fee and net adding up to gross when the split is fractional", () => {
      // Half a cent each way — the amounts where rounding both figures
      // independently leaves the page a cent short.
      for (const gross of [1, 3, 7, 3333, 99_999]) {
        const { feeCents, netCents } = splitRevenue(gross);
        expect(feeCents + netCents).toBe(gross);
      }
    });

    it("splits zero into zeroes", () => {
      expect(splitRevenue(0)).toEqual({
        grossCents: 0,
        feeCents: 0,
        netCents: 0,
      });
    });
  });

  describe("parseAnalyticsRange", () => {
    it("accepts each offered token", () => {
      // Read from the table, so that a new range cannot be offered unless it
      // also parses. Note that "30d" is a weak case on its own: the fallback
      // returns "30d" too, so the exact table above is what pins that entry.
      for (const { value } of ANALYTICS_RANGES) {
        expect(parseAnalyticsRange(value)).toBe(value);
      }
    });

    it("falls back to the default for junk or a missing param", () => {
      expect(parseAnalyticsRange(null)).toBe("30d");
      expect(parseAnalyticsRange("last tuesday")).toBe("30d");
    });
  });

  describe("rangeStart", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("has no start at all for all time", () => {
      expect(rangeStart("all")).toBeNull();
    });

    it("starts each window exactly that many days back", () => {
      // Every panel on the page compares against this one boundary, so the
      // service and the question queue can't disagree about what "30 days"
      // means. Inclusive: a row stamped exactly here is inside.
      expect(rangeStart("7d")).toBe("2026-06-08T12:00:00.000Z");
      expect(rangeStart("30d")).toBe("2026-05-16T12:00:00.000Z");
      expect(rangeStart("90d")).toBe("2026-03-17T12:00:00.000Z");
    });
  });

  describe("formatMoney", () => {
    it("always shows cents, and zero is a price rather than 'Free'", () => {
      expect(formatMoney(0)).toBe("$0.00");
      expect(formatMoney(4999)).toBe("$49.99");
    });

    it("groups thousands", () => {
      expect(formatMoney(123_456_789)).toBe("$1,234,567.89");
    });
  });

  describe("formatBucket", () => {
    it("labels a day bucket", () => {
      expect(formatBucket("2026-06-05")).toBe("5 Jun");
    });

    it("labels a month bucket", () => {
      expect(formatBucket("2025-11")).toBe("Nov 25");
    });

    it("names every month", () => {
      // A chart axis can show a full year. Thus every name in the month
      // table must be correct, not only the two that one example uses.
      const months = [
        "01",
        "02",
        "03",
        "04",
        "05",
        "06",
        "07",
        "08",
        "09",
        "10",
        "11",
        "12",
      ];
      expect(months.map((month) => formatBucket(`2026-${month}`))).toEqual([
        "Jan 26",
        "Feb 26",
        "Mar 26",
        "Apr 26",
        "May 26",
        "Jun 26",
        "Jul 26",
        "Aug 26",
        "Sep 26",
        "Oct 26",
        "Nov 26",
        "Dec 26",
      ]);
    });

    it("leaves the month empty for a bucket it cannot read", () => {
      // A bucket with an impossible month gives a label with no month name
      // in it. The axis still renders, and shows no placeholder word.
      //
      // The specified behaviour is "no month name", not the exact spacing
      // that the empty name leaves behind. Trim the result, so that this test
      // does not block a later tidy-up of the padding.
      expect(formatBucket("2026-13-05").trim()).toBe("5");
      expect(formatBucket("2026-99").trim()).toBe("26");
    });
  });
});
