import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Link, useNavigate } from "react-router";
import { z } from "zod";
import {
  Bell,
  Check,
  GraduationCap,
  MessageSquare,
  Receipt,
  Settings,
  UsersRound,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { UserAvatar } from "~/components/user-avatar";
import {
  badgeLabel,
  clickNotification,
  emptyNotificationFeed,
  type FeedCredentials,
  type FeedNotification,
  type FeedState,
  type NotificationFeed,
} from "~/lib/notification-feed";

// ─── Notification Feed ───
// The bell in the sidebar header and its popover (variant A2 from
// prototype/notification-feed). Everything here talks to the NotificationFeed
// port, never to Knock.

const FeedContext = createContext<NotificationFeed>(emptyNotificationFeed());

/**
 * Opens the signed-in person's Notification Feed and keeps it live. When the
 * person changes (switching user in the DevUI panel) the old feed and its
 * socket are torn down and a new one opens with the new person's token.
 */
export function NotificationFeedProvider({
  credentials,
  children,
}: {
  credentials: FeedCredentials | null;
  children: ReactNode;
}) {
  const [feed, setFeed] = useState<NotificationFeed>(emptyNotificationFeed);
  const userId = credentials?.userId;

  useEffect(() => {
    if (!credentials) {
      setFeed(emptyNotificationFeed());
      return;
    }

    let opened: NotificationFeed | null = null;
    let cancelled = false;
    // Loaded in the browser only: the Knock client opens a socket.
    void import("~/lib/notification-feed.knock").then(
      ({ knockNotificationFeed }) => {
        if (cancelled) return;
        opened = knockNotificationFeed(credentials, () =>
          fetchFeedToken(credentials.userId)
        );
        setFeed(opened);
      }
    );

    return () => {
      cancelled = true;
      opened?.dispose();
      setFeed(emptyNotificationFeed());
    };
    // Re-open only when the person changes. The layout loader signs a fresh
    // token on every revalidation; reconnecting on each would churn the socket.
    // Instead the feed fetches a fresh token itself just before the old one
    // expires (fetchFeedToken).
    // oxlint-disable-next-line react/exhaustive-deps
  }, [userId]);

  return <FeedContext.Provider value={feed}>{children}</FeedContext.Provider>;
}

const feedTokenSchema = z.object({ userId: z.string(), userToken: z.string() });

/**
 * A fresh signed user token for `userId`, or null when the session now holds
 * someone else (or no one), so the old feed is left to lapse.
 */
async function fetchFeedToken(userId: string): Promise<string | null> {
  const response = await fetch("/api/notification-feed-token");
  if (!response.ok) return null;
  const parsed = feedTokenSchema.safeParse(await response.json());
  if (!parsed.success || parsed.data.userId !== userId) return null;
  return parsed.data.userToken;
}

function useNotificationFeed(): [NotificationFeed, FeedState] {
  const feed = useContext(FeedContext);
  const state = useSyncExternalStore(
    feed.subscribe,
    feed.getState,
    feed.getState
  );
  return [feed, state];
}

export function NotificationBell() {
  const [feed, state] = useNotificationFeed();
  const [open, setOpen] = useState(false);
  const badge = badgeLabel(state.unseenCount);

  function toggle() {
    // Opening marks everything seen, loaded or not. Seen isn't read, so
    // unread rows stay bold.
    if (!open) void feed.markAllSeen();
    setOpen(!open);
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        title="Notifications"
        aria-label={`Notifications (${state.unseenCount} unseen)`}
        className="relative rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <Bell className="size-4" />
        {badge && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {badge}
          </span>
        )}
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            role="presentation"
            onClick={() => setOpen(false)}
          />
          <NotificationPopover
            feed={feed}
            state={state}
            close={() => setOpen(false)}
          />
        </>
      )}
    </>
  );
}

/** The popover header's gear: opens the Notifications card on /settings. */
function NotificationSettingsLink({ onClick }: { onClick: () => void }) {
  return (
    <Link
      to="/settings#notifications"
      onClick={onClick}
      aria-label="Notification settings"
      title="Notification settings"
      className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <Settings className="size-4" />
    </Link>
  );
}

function NotificationPopover({
  feed,
  state,
  close,
}: {
  feed: NotificationFeed;
  state: FeedState;
  close: () => void;
}) {
  const navigate = useNavigate();

  function openNotification(notification: FeedNotification) {
    const { markRead, navigateTo } = clickNotification(
      notification,
      describeNotification(notification).url
    );
    void feed.markRead(markRead);
    // A row with nowhere to go only marks itself read; the popover stays.
    if (navigateTo === null) return;
    close();
    navigate(navigateTo);
  }

  return (
    <div className="fixed left-56 top-2 z-50 ml-2 flex max-h-[calc(100vh-1rem)] w-[26rem] flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl">
      <div className="flex items-center gap-2 bg-muted/60 px-4 py-3">
        <Bell className="size-4" />
        <span className="font-semibold">Notifications</span>
        <button
          type="button"
          onClick={() => void feed.markAllRead()}
          disabled={state.unreadCount === 0}
          className="ml-auto text-xs font-medium text-primary hover:underline disabled:pointer-events-none disabled:opacity-50"
        >
          Mark all as read
        </button>
        <NotificationSettingsLink onClick={close} />
      </div>
      <div className="flex-1 overflow-y-auto">
        {state.notifications.map((notification) => (
          <NotificationRow
            key={notification.id}
            notification={notification}
            onOpen={() => openNotification(notification)}
            onMarkRead={() => void feed.markRead([notification.id])}
          />
        ))}
        {state.status === "ready" && state.notifications.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            You're all caught up.
          </p>
        )}
        {state.status === "ready" && state.notifications.length > 0 && (
          <LoadMoreSentinel feed={feed} state={state} />
        )}
        {state.status === "loading" && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            Loading…
          </p>
        )}
        {state.status === "error" && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            Notifications couldn't be loaded.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Sits under the last row. While it's in view and older Notifications exist,
 * it keeps loading the next page, so scrolling reaches the whole history.
 */
function LoadMoreSentinel({
  feed,
  state,
}: {
  feed: NotificationFeed;
  state: FeedState;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) =>
      setInView(entry?.isIntersecting ?? false)
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Re-checked on every state change: a page that doesn't fill the popover
  // leaves the sentinel in view, and a real-time fetch can make Knock skip a
  // page request, so keep asking until there's nothing older.
  useEffect(() => {
    if (inView && state.hasMore && !state.loadingMore) void feed.loadMore();
  }, [feed, inView, state.hasMore, state.loadingMore, state.notifications]);

  return (
    <div
      ref={ref}
      className="px-4 py-3 text-center text-xs text-muted-foreground"
    >
      {state.hasMore ? "Loading…" : "That's everything."}
    </div>
  );
}

function NotificationRow({
  notification,
  onOpen,
  onMarkRead,
}: {
  notification: FeedNotification;
  onOpen: () => void;
  onMarkRead: () => void;
}) {
  const { title, body, icon } = describeNotification(notification);
  const read = notification.readAt !== null;
  const actor = notification.actor;

  return (
    <div className="flex w-full items-center gap-3 px-4 py-2.5 hover:bg-accent">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="relative shrink-0">
          {actor ? (
            <UserAvatar
              name={actor.name}
              avatarUrl={actor.avatarUrl}
              className={cn("size-9", read && "opacity-60")}
            />
          ) : (
            <span
              className={cn(
                "flex size-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground",
                read && "opacity-60"
              )}
            >
              C
            </span>
          )}
          <span className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-popover text-muted-foreground ring-1 ring-border [&_svg]:size-2.5">
            {icon}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn("block truncate text-sm", !read && "font-semibold")}
          >
            {title}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {body} · {timeAgo(notification.insertedAt)}
          </span>
        </span>
      </button>
      {!read && (
        <button
          type="button"
          onClick={onMarkRead}
          title="Mark as read"
          aria-label="Mark as read"
          className="shrink-0 rounded-full p-1 text-muted-foreground hover:text-primary"
        >
          <Check className="size-4" />
        </button>
      )}
    </div>
  );
}

/**
 * Cadence's copy for each kind of Notification, written from its data. `url`
 * is the click target; leave it out (or undefined) for a row with nowhere to
 * go, and clicking it only marks it read.
 */
function describeNotification(notification: FeedNotification): {
  title: string;
  body: string;
  icon: ReactNode;
  /** Undefined when the Notification has nowhere to click. */
  url: string | undefined;
} {
  const actorName = notification.actor?.name ?? "Someone";
  switch (notification.kind) {
    case "discussion-reply":
      return {
        title: `${actorName} replied to your Discussion Question`,
        body: `“${notification.data.snippet}”`,
        icon: <MessageSquare />,
        url: notification.data.url,
      };
    case "discussion-question":
      return {
        title: `${actorName} asked a Discussion Question on ${notification.data.lessonTitle}`,
        body: `“${notification.data.snippet}”`,
        icon: <MessageSquare />,
        url: notification.data.url,
      };
    case "seat-claimed": {
      const { courseTitle, seatsLeft } = notification.data;
      return {
        title: `${actorName} claimed a Seat on ${courseTitle}`,
        body: `${seatsLeft} ${seatsLeft === 1 ? "Seat" : "Seats"} left`,
        icon: <UsersRound />,
        url: notification.data.url,
      };
    }
    case "new-enrollment":
      return {
        title: `${actorName} enrolled in ${notification.data.courseTitle}`,
        body: "New Enrollment",
        icon: <GraduationCap />,
        url: notification.data.url,
      };
    case "refund-requested":
      return {
        title: "We're reviewing your Refund Request",
        body: `${notification.data.amount} for ${notification.data.courseTitle}`,
        icon: <Receipt />,
        url: undefined,
      };
    case "refund-request-open":
      return {
        title: `${notification.data.buyerName} raised a ${notification.data.amount} Refund Request on ${notification.data.courseTitle}`,
        body: `“${notification.data.reason}”`,
        icon: <Receipt />,
        url: notification.data.url,
      };
    case "refund-approved":
      return {
        title: `Your Refund Request for ${notification.data.courseTitle} was approved`,
        body: [
          `${notification.data.amount} for your ${purchaseLabel(notification.data.purchaseKind)} is on its way back.`,
          notification.data.decisionNote &&
            `“${notification.data.decisionNote}”`,
        ]
          .filter(Boolean)
          .join(" "),
        icon: <Receipt />,
        url: notification.data.url,
      };
    case "refund-declined":
      return {
        title: `Your Refund Request for ${notification.data.courseTitle} was declined`,
        body: `“${notification.data.decisionNote}” You keep your ${purchaseLabel(notification.data.purchaseKind)}, and you can raise a new Refund Request.`,
        icon: <Receipt />,
        url: notification.data.url,
      };
  }
}

function purchaseLabel(kind: "individual_purchase" | "team_licence") {
  return kind === "team_licence" ? "Team Licence" : "Purchase";
}

function timeAgo(iso: string) {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}
