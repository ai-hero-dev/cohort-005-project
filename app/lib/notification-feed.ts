import { z } from "zod";

// ─── Notification Feed: shared shapes and the client port ───
// Safe to import from both server and browser code. The server's
// Notifications port (notifications.server.ts) sends data in these shapes;
// the browser's NotificationFeed reads it back, parsed with the same schemas.

/**
 * The trigger data for each kind of Notification. Kept flat: Knock's compact
 * feed drops nested values. `url` is where clicking the row goes.
 */
export const notificationDataSchemas = {
  "discussion-reply": z.object({
    commentId: z.number(),
    questionId: z.number(),
    lessonId: z.number(),
    lessonTitle: z.string(),
    snippet: z.string(),
    url: z.string(),
  }),
  "seat-claimed": z.object({
    seatId: z.number(),
    courseId: z.number(),
    courseTitle: z.string(),
    seatsLeft: z.number(),
    url: z.string(),
  }),
  // The new Enrollment Notification to the course's Instructor (opt-in).
  "new-enrollment": z.object({
    enrollmentId: z.number(),
    courseId: z.number(),
    courseTitle: z.string(),
    url: z.string(),
  }),
  "discussion-question": z.object({
    commentId: z.number(),
    lessonId: z.number(),
    lessonTitle: z.string(),
    snippet: z.string(),
    url: z.string(),
  }),
  // Refund Request confirmation: from Cadence, nowhere to click.
  "refund-requested": z.object({
    refundRequestId: z.number(),
    courseTitle: z.string(),
    amount: z.string(),
  }),
  "refund-request-open": z.object({
    refundRequestId: z.number(),
    buyerName: z.string(),
    courseTitle: z.string(),
    amount: z.string(),
    reason: z.string(),
    url: z.string(),
  }),
  "refund-approved": z.object({
    refundRequestId: z.number(),
    courseTitle: z.string(),
    purchaseKind: z.enum(["individual_purchase", "team_licence"]),
    amount: z.string(),
    decisionNote: z.string().nullable(),
    url: z.string(),
  }),
  "refund-declined": z.object({
    refundRequestId: z.number(),
    courseTitle: z.string(),
    purchaseKind: z.enum(["individual_purchase", "team_licence"]),
    amount: z.string(),
    decisionNote: z.string(),
    url: z.string(),
  }),
};

export type NotificationKind = keyof typeof notificationDataSchemas;

export type NotificationData<K extends NotificationKind> = z.infer<
  (typeof notificationDataSchemas)[K]
>;

/** What the browser needs to read one person's Notification Feed live. */
export type FeedCredentials = {
  userId: string;
  userToken: string;
  publicKey: string;
  feedChannelId: string;
};

type FeedNotificationOf<K extends NotificationKind> = {
  id: string;
  kind: K;
  data: NotificationData<K>;
  /** Who caused it; null for Notifications Cadence sends itself. */
  actor: { name: string; avatarUrl: string | null } | null;
  insertedAt: string;
  readAt: string | null;
  seenAt: string | null;
};

export type FeedNotification = {
  [K in NotificationKind]: FeedNotificationOf<K>;
}[NotificationKind];

export type FeedState = {
  /** Newest first. */
  notifications: FeedNotification[];
  unseenCount: number;
  unreadCount: number;
  status: "loading" | "ready" | "error";
  /** Older Notifications exist that `loadMore()` would fetch. */
  hasMore: boolean;
  /** A `loadMore()` is in flight. */
  loadingMore: boolean;
};

/**
 * One signed-in person's Notification Feed in the browser, kept up to date
 * live. Feed components only ever talk to this.
 */
export interface NotificationFeed {
  getState(): FeedState;
  /** Calls `listener` whenever the state changes. Returns an unsubscribe. */
  subscribe(listener: () => void): () => void;
  /** Loads the next page of older Notifications. No-op when there are none. */
  loadMore(): Promise<void>;
  /** Marks these read; skips already-read ones and never sends an empty batch. */
  markRead(ids: string[]): Promise<void>;
  /** Marks every Notification seen, loaded or not. Seen isn't read. */
  markAllSeen(): Promise<void>;
  /** Marks every Notification read, loaded or not. */
  markAllRead(): Promise<void>;
  /** Closes the live connection. The feed is unusable afterwards. */
  dispose(): void;
}

const EMPTY_STATE: FeedState = {
  notifications: [],
  unseenCount: 0,
  unreadCount: 0,
  status: "ready",
  hasMore: false,
  loadingMore: false,
};

/** The feed for someone with no Notifications to read (signed out, no Knock). */
export function emptyNotificationFeed(): NotificationFeed {
  return {
    getState: () => EMPTY_STATE,
    subscribe: () => () => {},
    loadMore: async () => {},
    markRead: async () => {},
    markAllSeen: async () => {},
    markAllRead: async () => {},
    dispose: () => {},
  };
}

/** What the bell's badge reads: nothing at zero, capped at "9+". */
export function badgeLabel(unseenCount: number): string | null {
  if (unseenCount <= 0) return null;
  return unseenCount > 9 ? "9+" : String(unseenCount);
}

/**
 * The ids from `ids` worth marking read: loaded and still unread. Empty when
 * there's nothing to send, and callers must then send nothing, because Knock
 * answers an empty batch with a 422.
 */
export function unreadAmong(
  notifications: { id: string; readAt: string | null }[],
  ids: string[]
): string[] {
  return notifications
    .filter((n) => ids.includes(n.id) && !n.readAt)
    .map((n) => n.id);
}

/**
 * What clicking a row does: mark it read if it isn't, then go to its click
 * target. A row with nowhere to go only marks itself read (the popover stays
 * open, since `navigateTo` is null).
 */
export function clickNotification(
  notification: { id: string; readAt: string | null },
  url: string | null | undefined
): { markRead: string[]; navigateTo: string | null } {
  return {
    markRead: notification.readAt ? [] : [notification.id],
    navigateTo: url ? url : null,
  };
}

/**
 * Turns a raw feed entry into a FeedNotification, or null when its kind is
 * unknown or its data doesn't match (e.g. sent by an older Cadence).
 */
export function parseFeedNotification(entry: {
  id: string;
  kind: string;
  data: unknown;
  actor: FeedNotification["actor"];
  insertedAt: string;
  readAt: string | null;
  seenAt: string | null;
}): FeedNotification | null {
  if (!isNotificationKind(entry.kind)) return null;
  const parsed = notificationDataSchemas[entry.kind].safeParse(entry.data);
  if (!parsed.success) return null;
  // TS can't correlate kind with its parsed data across the union; the schema
  // lookup by entry.kind guarantees they match.
  return { ...entry, kind: entry.kind, data: parsed.data } as FeedNotification;
}

function isNotificationKind(kind: string): kind is NotificationKind {
  return Object.hasOwn(notificationDataSchemas, kind);
}
