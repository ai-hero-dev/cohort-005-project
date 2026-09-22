import type { RefundStatus } from "~/db/schema";
import { refundBlocker, refundableAmount } from "~/lib/refunds";
import { type Clock } from "~/modules/clock";
import {
  REFUND_WINDOW_DAYS,
  daysLeftInRefundWindow,
  isWithinRefundWindow,
  lastDayOfRefundWindow,
} from "~/modules/refund-window";
import {
  MAX_COMPLETED_SHARE,
  MAX_WATCHED_SECONDS,
  completedShare,
} from "./lib/conditions";

// ─── The refund policy ───
//
// The four conditions a Purchase must meet before a Learner may raise a
// Refund: inside the fourteen-day window, under half the Course completed,
// under the Watch Limit, and no team seat claimed from it. All four, or no
// Refund.
//
// This module is the only place those four are written down. Before it, they
// were written twice — once in the course page's loader, to decide whether to
// offer the button, and once in the refund action, to decide whether to accept
// the form — and the two copies had already drifted apart. The action never
// asked how much of the Course the Learner had finished, so a Learner who
// could not see the button could still post to it.
//
// It takes plain facts and a `Clock`. It reads nothing and writes nothing, so
// the caller decides where the facts come from, and a test can ask it about
// any day it likes.

/** Everything the policy needs to know about one Purchase. */
export type RefundFacts = {
  /** When the Purchase was made, as the ISO string the column holds. */
  purchasedAt: string;
  /** What the Learner actually paid, in cents. */
  amountPaidCents: number;
  lessonCount: number;
  completedLessonCount: number;
  /** Watched on this Course, in seconds. */
  watchedSeconds: number;
  /** Whether a team seat bought with this Purchase has been claimed. */
  hasClaimedSeat: boolean;
  /** The Refunds already on this Purchase, whatever their outcome. */
  existingRefunds: { status: RefundStatus }[];
};

/** Which condition refused the Refund. Exactly one, the first that failed. */
export type RefundRefusal =
  | "already-requested"
  | "already-refunded"
  | "window-closed"
  | "too-much-completed"
  | "too-much-watched"
  | "seat-claimed";

export type RefundDecision =
  | {
      eligible: true;
      /** What the Learner gets back: exactly what they paid. */
      refundableCents: number;
      /** The last day they may still ask. */
      lastDayInWindow: string;
      daysLeft: number;
    }
  | {
      eligible: false;
      refusedBy: RefundRefusal;
      /** What to tell the Learner. The policy owns its own explanation. */
      message: string;
    };

/**
 * Whether this Learner may have their money back, and how much.
 *
 * The conditions are checked in the order the course page has always checked
 * them, after the one that is not a condition at all — a Refund already on the
 * Purchase. Order decides which refusal the Learner is shown, so it is fixed
 * here rather than left to whichever caller asked.
 *
 * Two answers are not the policy's own. Whether an earlier Refund blocks a new
 * one is `refundBlocker`, and how much comes back is `refundableAmount`, both
 * in `~/lib/refunds`. `resolveRefund` gives back the same amount when an Admin
 * approves.
 */
export function decideRefund(facts: RefundFacts, clock: Clock): RefundDecision {
  const blocker = refundBlocker(facts.existingRefunds);

  if (blocker === "already-requested") {
    return {
      eligible: false,
      refusedBy: "already-requested",
      message: "You already have a request open on this purchase.",
    };
  }

  if (blocker === "already-refunded") {
    return {
      eligible: false,
      refusedBy: "already-refunded",
      message: "This purchase has already been refunded.",
    };
  }

  if (!isWithinRefundWindow(facts.purchasedAt, clock)) {
    return {
      eligible: false,
      refusedBy: "window-closed",
      message: `The ${REFUND_WINDOW_DAYS}-day window has closed.`,
    };
  }

  if (
    completedShare(facts.completedLessonCount, facts.lessonCount) >=
    MAX_COMPLETED_SHARE
  ) {
    return {
      eligible: false,
      refusedBy: "too-much-completed",
      message: "You have finished too much of this course to get a refund.",
    };
  }

  if (facts.watchedSeconds >= MAX_WATCHED_SECONDS) {
    return {
      eligible: false,
      refusedBy: "too-much-watched",
      message: "You have watched too much of this course to get a refund.",
    };
  }

  if (facts.hasClaimedSeat) {
    return {
      eligible: false,
      refusedBy: "seat-claimed",
      message: "A claimed team seat cannot be refunded.",
    };
  }

  return {
    eligible: true,
    refundableCents: refundableAmount({ amountPaid: facts.amountPaidCents }),
    lastDayInWindow: lastDayOfRefundWindow(facts.purchasedAt),
    daysLeft: daysLeftInRefundWindow(facts.purchasedAt, clock),
  };
}
