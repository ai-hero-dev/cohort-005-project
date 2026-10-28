import { describe, expect, it } from "vitest";
import { isRevoked } from "./enrollments";

describe("isRevoked", () => {
  it("is false while the Enrollment still gives access", () => {
    expect(isRevoked({ revokedAt: null })).toBe(false);
  });

  it("is true once the Enrollment has been taken away", () => {
    expect(isRevoked({ revokedAt: "2026-10-02T09:30:00.000Z" })).toBe(true);
  });
});
