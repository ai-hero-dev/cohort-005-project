// ─── Notification preferences ───
// Which Notification categories reach a person, per channel. Shared by the
// server and the /settings Notifications card. Only the feed channel is used
// in v1. Knock's keys for these live in the Knock adapter, not here.

export const NOTIFICATION_CATEGORIES = [
  "refundRequestUpdates",
  "seatClaims",
  "enrollments",
  "discussionQuestions",
  "openRefundRequests",
  "discussionReplies",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_CHANNELS = ["feed"] as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/**
 * A person's preference set, category × channel. A missing category or
 * channel means the person (or Knock) has no stored choice for it.
 */
export type NotificationPreferences = {
  [C in NotificationCategory]?: { [Ch in NotificationChannel]?: boolean };
};

/** Each category's feed switch, with defaults filled in. */
export type FeedPreferences = Record<NotificationCategory, boolean>;

/** What every user starts with: Enrollments off, everything else on. */
export const DEFAULT_FEED_PREFERENCES: FeedPreferences = {
  refundRequestUpdates: true,
  seatClaims: true,
  enrollments: false,
  discussionQuestions: true,
  openRefundRequests: true,
  discussionReplies: true,
};

export const NOTIFICATION_CATEGORY_LABELS: Record<
  NotificationCategory,
  { label: string; description: string }
> = {
  refundRequestUpdates: {
    label: "Refund Request updates",
    description: "When a Refund Request you raised is received or decided.",
  },
  seatClaims: {
    label: "Claimed Seats",
    description: "When someone claims a Seat on your Team Licence.",
  },
  enrollments: {
    label: "Enrollments",
    description: "When a Student enrolls on one of your courses.",
  },
  discussionQuestions: {
    label: "Discussion Questions",
    description:
      "When someone asks a Discussion Question on one of your lessons.",
  },
  openRefundRequests: {
    label: "Open Refund Requests",
    description: "When a Refund Request is waiting for a decision.",
  },
  discussionReplies: {
    label: "Discussion Replies",
    description: "When someone replies to your Discussion Question.",
  },
};
