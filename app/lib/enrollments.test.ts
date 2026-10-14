import { describe, expect, it } from "vitest";
import { isLapsed } from "./enrollments";

describe("isLapsed", () => {
  it("is false while the Enrollment still gives access", () => {
    expect(isLapsed({ revokedAt: null })).toBe(false);
  });

  it("is true once the Enrollment has been taken away", () => {
    expect(isLapsed({ revokedAt: "2026-10-02T09:30:00.000Z" })).toBe(true);
  });
});
