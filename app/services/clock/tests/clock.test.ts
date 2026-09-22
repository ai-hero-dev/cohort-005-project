import { describe, expect, it } from "vitest";
import { addDays, calendarDayOf, daysBetween, systemClock } from "../index";

describe("calendarDayOf", () => {
  it("reads the UTC day a moment falls on", () => {
    expect(calendarDayOf("2026-03-15T12:00:00.000Z")).toBe("2026-03-15");
  });

  it("keeps a late-evening moment on its own UTC day", () => {
    expect(calendarDayOf("2026-03-15T23:59:59.000Z")).toBe("2026-03-15");
  });
});

describe("addDays", () => {
  it("adds whole days", () => {
    expect(addDays("2026-03-01T09:00:00.000Z", 14)).toBe("2026-03-15");
  });

  it("keeps the time of day out of the answer", () => {
    expect(addDays("2026-03-01T23:30:00.000Z", 14)).toBe("2026-03-15");
  });

  it("crosses a month end", () => {
    expect(addDays("2026-02-25T09:00:00.000Z", 14)).toBe("2026-03-11");
  });

  it("crosses a leap day", () => {
    expect(addDays("2028-02-20T09:00:00.000Z", 14)).toBe("2028-03-05");
  });
});

describe("daysBetween", () => {
  it("counts the days from one day to a later one", () => {
    expect(daysBetween("2026-03-01", "2026-03-15")).toBe(14);
  });

  it("is zero for the same day", () => {
    expect(daysBetween("2026-03-15", "2026-03-15")).toBe(0);
  });

  it("goes negative when the second day is the earlier one", () => {
    expect(daysBetween("2026-03-15", "2026-03-14")).toBe(-1);
  });
});

describe("systemClock", () => {
  it("answers with a calendar day", () => {
    expect(systemClock.today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
