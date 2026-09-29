import { describe, it, expect } from "vitest";
import { RefundStatus } from "~/db/schema";
import {
  buildRefundOutcomeEmail,
  canResolveRefund,
  refundBlocker,
  refundableAmount,
} from "./refunds";

describe("refundableAmount", () => {
  it("gives back exactly what the learner paid, not the list price", () => {
    // A coupon or purchasing-power purchase paid less than list. The Refund
    // must match the Purchase, never the Course.
    expect(refundableAmount({ amountPaid: 4000 })).toBe(4000);
  });
});

describe("refundBlocker", () => {
  it("allows a first request", () => {
    expect(refundBlocker([])).toBeNull();
  });

  it("allows a new request after a decline", () => {
    expect(refundBlocker([{ status: RefundStatus.Declined }])).toBeNull();
  });

  it("blocks a second request while one is waiting", () => {
    expect(refundBlocker([{ status: RefundStatus.Requested }])).toBe(
      "already-requested"
    );
  });

  it("blocks any request once the purchase has been refunded", () => {
    expect(
      refundBlocker([
        { status: RefundStatus.Declined },
        { status: RefundStatus.Approved },
      ])
    ).toBe("already-refunded");
  });
});

describe("canResolveRefund", () => {
  it("lets an Admin decide a requested Refund", () => {
    expect(canResolveRefund({ status: RefundStatus.Requested })).toBe(true);
  });

  it("treats a decided Refund as final", () => {
    expect(canResolveRefund({ status: RefundStatus.Approved })).toBe(false);
    expect(canResolveRefund({ status: RefundStatus.Declined })).toBe(false);
  });
});

describe("buildRefundOutcomeEmail", () => {
  const base = {
    learnerName: "Ada",
    learnerEmail: "ada@example.com",
    courseTitle: "Introduction to TypeScript",
    amount: 4000,
  };

  it("tells an approved learner the amount and that access is gone", () => {
    const email = buildRefundOutcomeEmail({
      ...base,
      outcome: RefundStatus.Approved,
    });

    expect(email.to).toBe("ada@example.com");
    expect(email.subject).toBe("Refund approved — Introduction to TypeScript");
    expect(email.body).toContain("$40.00");
    expect(email.body).toContain("no longer have access");
  });

  it("tells a declined learner they keep access, without a reason", () => {
    const email = buildRefundOutcomeEmail({
      ...base,
      outcome: RefundStatus.Declined,
    });

    expect(email.subject).toBe("Refund declined — Introduction to TypeScript");
    expect(email.body).toContain("still have full access");
    expect(email.body).not.toContain("$40.00");
  });
});
