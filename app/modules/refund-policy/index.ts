import { RefundStatus } from "~/db/schema";
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
// The four conditions a Purchase must meet before its buyer may raise a
// Refund Request: inside the fourteen-day window, under half the course
// completed, under the Watch Limit, and no Claimed Seat on it. All four, or
// no Refund. An Individual Purchase is held to the middle two; a Team Licence,
// which gives its buyer nothing to watch, to the last.
//
// This module is the only place those four are written down. Before it, they
// sat in `refunds.server.ts` among the queries that gather the facts, so the
// only way to ask one a question was to build a database and pass a `Date`.
// The fourteen days were counted there and again in `refund-window`, and the
// two counts had already drifted apart.
//
// It takes plain facts and a `Clock`. It reads nothing and writes nothing, so
// the caller decides where the facts come from, and a test can ask it about
// any day it likes.

/**
 * How far the buyer has got with what they bought. For an Individual Purchase
 * that is their own progress. A Team Licence gives its buyer nothing to watch,
 * so for one it is how many of its Seats have been claimed.
 */
export type RefundFigures =
  | {
      kind: "individual_purchase";
      lessonsCompleted: number;
      lessonCount: number;
      secondsWatched: number;
    }
  | {
      kind: "team_licence";
      seatCount: number;
      claimedSeatCount: number;
    };

/** Everything the policy needs to know about one Purchase. */
export type RefundFacts = {
  /** When the Purchase was made, as the ISO string the column holds. */
  purchasedAt: string;
  /** What the buyer actually paid, in cents. */
  amountPaidCents: number;
  figures: RefundFigures;
  /** The Refunds already on this Purchase, whatever their outcome. */
  existingRefunds: { status: RefundStatus }[];
};

/** A condition of the policy that a Purchase fails. */
export type RuleBreak =
  "window_closed" | "watched_too_much" | "completed_too_much" | "seat_claimed";

/** Which condition refused the Refund. Exactly one, the first that failed. */
export type RefundRefusal =
  "already_requested" | "already_refunded" | RuleBreak;

export type RefundDecision =
  | {
      eligible: true;
      /** What the buyer gets back: exactly what they paid. */
      refundableCents: number;
      /** The last day they may still ask. */
      lastDayInWindow: string;
      daysLeft: number;
    }
  | {
      eligible: false;
      refusedBy: RefundRefusal;
      /** What to tell the buyer. The policy owns its own explanation. */
      message: string;
    };

/** What the buyer is told when a condition refuses them. */
const REFUSAL_MESSAGES: Record<RefundRefusal, string> = {
  already_requested:
    "You already have an open refund request on this purchase.",
  already_refunded: "This purchase has already been refunded.",
  window_closed: `The ${REFUND_WINDOW_DAYS}-day window has closed.`,
  watched_too_much: "You have watched too much of this course to get a refund.",
  completed_too_much:
    "You have completed too much of this course to request a refund.",
  seat_claimed: "A Team Licence with a claimed Seat cannot be refunded.",
};

/** What a Platform Admin sees next to a Refund Request that breaks a rule. */
export const RULE_BREAK_LABELS: Record<RuleBreak, string> = {
  window_closed: `Raised outside the ${REFUND_WINDOW_DAYS}-day window`,
  watched_too_much: `Watched ${MAX_WATCHED_SECONDS / 3600} hours or more`,
  completed_too_much: `Completed ${MAX_COMPLETED_SHARE * 100}% of lessons or more`,
  seat_claimed: "A Seat has been claimed",
};

/**
 * Every condition this Purchase fails, in the order they are reported. The
 * clock says which day the window is judged on: today when a buyer asks, and
 * the day it was raised when a Platform Admin looks at a Refund Request.
 */
export function findRuleBreaks(facts: RefundFacts, clock: Clock): RuleBreak[] {
  const breaks: RuleBreak[] = [];
  const { figures } = facts;

  if (!isWithinRefundWindow(facts.purchasedAt, clock)) {
    breaks.push("window_closed");
  }

  if (figures.kind === "team_licence") {
    if (figures.claimedSeatCount > 0) breaks.push("seat_claimed");
    return breaks;
  }

  if (figures.secondsWatched >= MAX_WATCHED_SECONDS) {
    breaks.push("watched_too_much");
  }

  if (
    completedShare(figures.lessonsCompleted, figures.lessonCount) >=
    MAX_COMPLETED_SHARE
  ) {
    breaks.push("completed_too_much");
  }

  return breaks;
}

/**
 * Whether this buyer may have their money back, and how much.
 *
 * A Refund already on the Purchase is reported first: it is not one of the
 * four conditions, and it is the one a buyer is most likely to have hit. Then
 * the first condition that fails. Order decides which refusal the buyer is
 * shown, so it is fixed here rather than left to whichever caller asked.
 */
export function decideRefund(facts: RefundFacts, clock: Clock): RefundDecision {
  const statuses = facts.existingRefunds.map((refund) => refund.status);

  if (statuses.includes(RefundStatus.Open)) {
    return refuse("already_requested");
  }

  if (statuses.includes(RefundStatus.Approved)) {
    return refuse("already_refunded");
  }

  const [firstBreak] = findRuleBreaks(facts, clock);
  if (firstBreak) return refuse(firstBreak);

  return {
    eligible: true,
    refundableCents: facts.amountPaidCents,
    lastDayInWindow: lastDayOfRefundWindow(facts.purchasedAt),
    daysLeft: daysLeftInRefundWindow(facts.purchasedAt, clock),
  };
}

function refuse(refusedBy: RefundRefusal): RefundDecision {
  return { eligible: false, refusedBy, message: REFUSAL_MESSAGES[refusedBy] };
}
