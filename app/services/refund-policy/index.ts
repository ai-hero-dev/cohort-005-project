import { type Clock } from "~/services/clock";
import {
  REFUND_WINDOW_DAYS,
  daysLeftInRefundWindow,
  isWithinRefundWindow,
  lastDayOfRefundWindow,
} from "~/services/refund-window";
import {
  MAX_COMPLETED_SHARE,
  MAX_WATCHED_SECONDS,
  completedShare,
} from "./lib/conditions";

// ─── The Refund Policy ───
//
// `GLOSSARY.md`: the five conditions a Purchase must meet before a Learner may
// raise a Refund. All five, or no Refund.
//
// This module is the only place those five are written down. Before it, they
// were written twice — once in the course page's loader, to decide whether to
// offer the button, and once in the refund action, to decide whether to accept
// the form — and the two copies had already drifted apart. The action never
// asked how much of the Course the Learner had finished, so a Learner who
// could not see the button could still post to it.
//
// It takes plain facts and a `Clock`. It reads nothing and writes nothing, so
// the caller decides where the facts come from, and a test can ask it about
// any day it likes.

/** Everything the Policy needs to know about one Purchase. */
export type RefundFacts = {
  /** When the Purchase was made, as the ISO string the column holds. */
  purchasedAt: string;
  /** What the Learner actually paid, in cents. */
  amountPaidCents: number;
  /** The Course's list price, in cents. */
  listPriceCents: number;
  /** The country the Purchase was made from, for the Regional Price. */
  country: string | null;
  lessonCount: number;
  completedLessonCount: number;
  /** Watch Time on this Course, in seconds. */
  watchedSeconds: number;
  /** Whether a Seat minted by this Purchase has been claimed. */
  hasClaimedSeat: boolean;
  /** Whether this Purchase already has a Refund waiting on Staff. */
  hasOpenRefund: boolean;
};

/** Which condition refused the Refund. Exactly one, the first that failed. */
export type RefundRefusal =
  | "refund-already-open"
  | "window-closed"
  | "too-much-completed"
  | "too-much-watched"
  | "seat-claimed";

export type RefundDecision =
  | {
      eligible: true;
      /** What the Learner gets back: the Regional Price if they paid one. */
      refundableCents: number;
      /** The last day they may still ask. */
      lastDayInWindow: string;
      daysLeft: number;
    }
  | {
      eligible: false;
      refusedBy: RefundRefusal;
      /** What to tell the Learner. The Policy owns its own explanation. */
      message: string;
    };

/**
 * Whether this Learner may have their money back, and how much.
 *
 * The conditions are checked in the order `GLOSSARY.md` lists them, after the
 * one that is not a condition at all — a Refund already waiting on Staff.
 * Order decides which refusal the Learner is shown, so it is fixed here rather
 * than left to whichever caller asked.
 *
 * `isRegionalPrice` says whether the country the Purchase was made from has a
 * Regional Price. The Policy does not look that up itself: the discount table
 * is somebody else's, and the Policy only needs the yes or no.
 */
export function decideRefund(
  facts: RefundFacts,
  isRegionalPrice: (country: string | null) => boolean,
  clock: Clock
): RefundDecision {
  if (facts.hasOpenRefund) {
    return {
      eligible: false,
      refusedBy: "refund-already-open",
      message: "You already have a refund open on this purchase.",
    };
  }

  if (!isWithinRefundWindow(facts.purchasedAt, clock)) {
    return {
      eligible: false,
      refusedBy: "window-closed",
      message: `The ${REFUND_WINDOW_DAYS}-day refund window has closed.`,
    };
  }

  if (
    completedShare(facts.completedLessonCount, facts.lessonCount) >=
    MAX_COMPLETED_SHARE
  ) {
    return {
      eligible: false,
      refusedBy: "too-much-completed",
      message: "You have finished too much of this course to refund it.",
    };
  }

  if (facts.watchedSeconds >= MAX_WATCHED_SECONDS) {
    return {
      eligible: false,
      refusedBy: "too-much-watched",
      message: "You have watched too much of this course to refund it.",
    };
  }

  if (facts.hasClaimedSeat) {
    return {
      eligible: false,
      refusedBy: "seat-claimed",
      message: "A claimed team seat cannot be refunded.",
    };
  }

  // A Purchase made at a Regional Price is given back at that price, not at
  // the list price of the Course.
  return {
    eligible: true,
    refundableCents: isRegionalPrice(facts.country)
      ? facts.amountPaidCents
      : facts.listPriceCents,
    lastDayInWindow: lastDayOfRefundWindow(facts.purchasedAt),
    daysLeft: daysLeftInRefundWindow(facts.purchasedAt, clock),
  };
}
