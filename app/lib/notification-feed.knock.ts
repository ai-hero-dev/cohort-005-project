import Knock from "@knocklabs/client";
import type { FeedItem } from "@knocklabs/client";
import {
  parseFeedNotification,
  unreadAmong,
  type FeedCredentials,
  type FeedNotification,
  type FeedState,
  type NotificationFeed,
} from "~/lib/notification-feed";

// ─── Knock adapter for the browser's NotificationFeed ───
// The only browser code that imports Knock. One Knock client and one
// real-time socket per signed-in person; Knock pushes new Notifications down
// the socket, so nothing polls. `dispose()` tears it all down, so switching
// user means disposing this feed and creating one with the new credentials.

const PAGE_SIZE = 20;

/** Refresh the signed user token this long before it expires. */
const REFRESH_BEFORE_EXPIRY_MS = 5 * 60 * 1000;

/**
 * @param refreshUserToken Fetches a fresh signed user token for the same
 *   person, or null when there isn't one (signed out, switched user). Called
 *   shortly before the current token expires, so a tab left open for hours
 *   keeps its live feed.
 */
export function knockNotificationFeed(
  credentials: FeedCredentials,
  refreshUserToken: () => Promise<string | null>
): NotificationFeed {
  const knock = new Knock(credentials.publicKey);
  knock.authenticate({ id: credentials.userId }, credentials.userToken, {
    timeBeforeExpirationInMs: REFRESH_BEFORE_EXPIRY_MS,
    // Knock re-authenticates with the returned token and reconnects the
    // socket, keeping the loaded Notifications. Returning nothing gives up.
    onUserTokenExpiring: async () =>
      (await refreshUserToken().catch(() => null)) ?? undefined,
  });
  const feed = knock.feeds.initialize(credentials.feedChannelId, {
    page_size: PAGE_SIZE,
    archived: "exclude",
  });

  let state: FeedState = {
    notifications: [],
    unseenCount: 0,
    unreadCount: 0,
    status: "loading",
    hasMore: false,
    loadingMore: false,
  };
  // "loading" only covers the first page. Later fetches (paging, real-time)
  // keep the list on screen.
  let firstPage: "loading" | "ready" | "error" = "loading";
  const listeners = new Set<() => void>();

  function publish() {
    const knockState = feed.getState();
    state = {
      notifications: knockState.items
        .map(toFeedNotification)
        .filter((n): n is FeedNotification => n !== null),
      unseenCount: knockState.metadata.unseen_count,
      unreadCount: knockState.metadata.unread_count,
      status: firstPage,
      hasMore: knockState.pageInfo.after !== null,
      loadingMore: knockState.networkStatus === "fetchMore",
    };
    for (const listener of listeners) listener();
  }

  const unsubscribeStore = feed.store.subscribe(publish);
  feed.listenForUpdates();
  void feed.fetch().then((result) => {
    firstPage = !result || result.status === "error" ? "error" : "ready";
    publish();
  });

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async loadMore() {
      // Knock skips this while another fetch is in flight, and when the
      // `after` cursor says there's nothing older.
      await feed.fetchNextPage();
    },
    async markRead(ids) {
      const items = feed.getState().items;
      const toMark = unreadAmong(
        items.map((item) => ({ id: item.id, readAt: item.read_at })),
        ids
      );
      // Knock answers an empty batch with a 422.
      if (toMark.length === 0) return;
      await feed.markAsRead(items.filter((item) => toMark.includes(item.id)));
    },
    // Both bulk updates go by channel, so they cover Notifications that
    // aren't loaded yet. Skipped when the counts say there's nothing to do.
    async markAllSeen() {
      if (feed.getState().metadata.unseen_count === 0) return;
      await feed.markAllAsSeen();
    },
    async markAllRead() {
      if (feed.getState().metadata.unread_count === 0) return;
      await feed.markAllAsRead();
    },
    dispose() {
      unsubscribeStore();
      listeners.clear();
      feed.dispose();
      knock.teardown();
    },
  };
}

function toFeedNotification(item: FeedItem): FeedNotification | null {
  const actor = item.actors[0];
  return parseFeedNotification({
    id: item.id,
    kind: item.source.key,
    data: item.data,
    actor:
      actor && "name" in actor && typeof actor.name === "string"
        ? {
            name: actor.name,
            avatarUrl:
              "avatar" in actor && typeof actor.avatar === "string"
                ? actor.avatar
                : null,
          }
        : null,
    insertedAt: item.inserted_at,
    readAt: item.read_at,
    seenAt: item.seen_at,
  });
}
