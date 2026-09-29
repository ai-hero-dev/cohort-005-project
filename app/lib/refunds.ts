import { RefundStatus } from "~/db/schema";
import { formatPrice } from "~/lib/utils";

// ─── Refund rules ───
// Pure rules shared by the course page, the request route and the admin
// review page. See GLOSSARY.md for Refund and Revoked Enrollment.

/** An approved Refund gives back exactly what the Learner paid. */
export function refundableAmount(purchase: { amountPaid: number }): number {
  return purchase.amountPaid;
}

/**
 * Why a Purchase cannot take a new Refund request, given the Refunds already
 * on it — or null if it can. A declined Refund does not block a new one.
 */
export function refundBlocker(
  existing: { status: RefundStatus }[]
): "already-requested" | "already-refunded" | null {
  if (existing.some((r) => r.status === RefundStatus.Approved)) {
    return "already-refunded";
  }
  if (existing.some((r) => r.status === RefundStatus.Requested)) {
    return "already-requested";
  }
  return null;
}

/** An Admin's decision is final: only a requested Refund can be decided. */
export function canResolveRefund(refund: { status: RefundStatus }): boolean {
  return refund.status === RefundStatus.Requested;
}

type Email = { to: string; subject: string; body: string };

export function buildRefundOutcomeEmail(input: {
  outcome: RefundStatus.Approved | RefundStatus.Declined;
  learnerName: string;
  learnerEmail: string;
  courseTitle: string;
  amount: number;
}): Email {
  const approved = input.outcome === RefundStatus.Approved;

  return {
    to: input.learnerEmail,
    subject: approved
      ? `Refund approved — ${input.courseTitle}`
      : `Refund declined — ${input.courseTitle}`,
    body: [
      `Hi ${input.learnerName},`,
      "",
      approved
        ? `We have refunded ${formatPrice(input.amount)} for "${input.courseTitle}". You no longer have access to the course.`
        : `We have looked at your Refund request for "${input.courseTitle}" and declined it. You still have full access to the course.`,
      "",
      "— The Cadence team",
    ].join("\n"),
  };
}
