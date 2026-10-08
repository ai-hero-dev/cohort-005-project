// PROTOTYPE — throwaway, for "What does the Notification Feed look like in
// Cadence?" (ai-hero-dev/cohort-005-project#19). prototype/notification-feed only.
//
// Round 2: the bell popover won round 1 (the drawer and inbox variants are in
// the previous commit). These variants all keep the bell, and each tries a
// different answer to "what happens with 100 Notifications?":
//   A   Load more      — popover lists a page, "Load more" fetches the next
//   A2  Infinite scroll — reworked popover (Unread / Earlier), scrolling loads more
//   A3  Latest + See all — popover shows the latest 10, "See all" opens a page
// Switch with `?variant=A|A2|A3` or the floating bar. All read the real Knock
// feed from the browser with a signed user token; Knock pages by cursor.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link, useFetcher, useNavigate, useSearchParams } from "react-router";
import {
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  MessageSquare,
  Receipt,
  UsersRound,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { UserAvatar } from "~/components/user-avatar";

const KNOCK_API = "https://api.knock.app/v1";
const PAGE_SIZE = 20;

export type NotificationFeedConfig = {
  knockUserId: string;
  userToken: string;
  publicApiKey: string;
  feedChannelId: string;
};

type FeedEntry = {
  id: string;
  inserted_at: string;
  read_at: string | null;
  seen_at: string | null;
  data: Record<string, any>;
  actors: { name?: string; avatar?: string | null }[];
};

type FeedMeta = { unread_count: number; unseen_count: number; total_count: number };

// ─── Data: one feed per layout, shared by whichever variant renders ───
// The first page is polled; older pages are fetched on demand by cursor.
// Everything loaded lives in one map, so new arrivals pushing items off the
// first page never leave a gap.

function useKnockFeed(config: NotificationFeedConfig | null) {
  const [byId, setById] = useState<Map<string, FeedEntry>>(new Map());
  const [meta, setMeta] = useState<FeedMeta>({
    unread_count: 0,
    unseen_count: 0,
    total_count: 0,
  });
  // undefined = not loaded yet, null = no more pages
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);

  const headers = config && {
    Authorization: `Bearer ${config.publicApiKey}`,
    "X-Knock-User-Token": config.userToken,
    "Content-Type": "application/json",
  };

  function upsert(entries: FeedEntry[]) {
    setById((m) => {
      const next = new Map(m);
      for (const e of entries) next.set(e.id, e);
      return next;
    });
  }

  async function fetchPage(after?: string) {
    const url = new URL(
      `${KNOCK_API}/users/${config!.knockUserId}/feeds/${config!.feedChannelId}`
    );
    url.searchParams.set("page_size", String(PAGE_SIZE));
    if (after) url.searchParams.set("after", after);
    const res = await fetch(url, { headers: headers! });
    if (!res.ok) return null;
    return res.json();
  }

  const poll = useCallback(async () => {
    if (!config) return;
    const json = await fetchPage();
    if (!json) return;
    upsert(json.entries);
    setMeta(json.meta);
    setCursor((c) => (c === undefined ? json.page_info.after : c));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.knockUserId, config?.userToken]);

  useEffect(() => {
    setById(new Map());
    setCursor(undefined);
    poll();
    const t = setInterval(poll, 4000);
    return () => clearInterval(t);
  }, [poll]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    const json = await fetchPage(cursor);
    if (json) {
      upsert(json.entries);
      setCursor(json.page_info.after);
    }
    setLoadingMore(false);
  }

  const entries = [...byId.values()].sort((a, b) =>
    b.inserted_at.localeCompare(a.inserted_at)
  );

  async function batch(status: "seen" | "read" | "unread", ids: string[]) {
    if (!config || ids.length === 0) return; // empty message_ids → 422
    // Optimistic, so the UI reacts before the next poll.
    const now = new Date().toISOString();
    setById((m) => {
      const next = new Map(m);
      for (const id of ids) {
        const e = next.get(id);
        if (!e) continue;
        next.set(id, {
          ...e,
          seen_at: status === "unread" ? e.seen_at : (e.seen_at ?? now),
          read_at: status === "read" ? now : status === "unread" ? null : e.read_at,
        });
      }
      return next;
    });
    await fetch(`${KNOCK_API}/messages/batch/${status}`, {
      method: "POST",
      headers: headers!,
      body: JSON.stringify({ message_ids: ids }),
    });
    poll();
  }

  return {
    entries,
    meta,
    hasMore: !!cursor,
    loadingMore,
    loadMore,
    markRead: (ids: string[]) => batch("read", ids),
    markUnread: (ids: string[]) => batch("unread", ids),
    // Only what's loaded: unseen items further back stay unseen. A real
    // build would use Knock's bulk "mark all seen" endpoint server-side.
    markAllSeen: () => batch("seen", entries.filter((e) => !e.seen_at).map((e) => e.id)),
    markAllRead: () => batch("read", entries.filter((e) => !e.read_at).map((e) => e.id)),
  };
}

type Feed = ReturnType<typeof useKnockFeed>;
const FeedContext = createContext<Feed | null>(null);

export function useNotificationFeed() {
  return useContext(FeedContext);
}

export function NotificationFeedProvider({
  config,
  children,
}: {
  config: NotificationFeedConfig | null;
  children: React.ReactNode;
}) {
  const feed = useKnockFeed(config);
  return (
    <FeedContext.Provider value={config ? feed : null}>{children}</FeedContext.Provider>
  );
}

// ─── Copy: what each catalogue Notification says ───

type Category = "discussion" | "refund" | "team" | "enrollment";

function describe(entry: FeedEntry) {
  const d = entry.data;
  const actor = entry.actors[0]?.name ?? "Someone";
  switch (d.kind) {
    case "discussion-question":
      return {
        category: "discussion" as Category,
        title: `${actor} asked a question`,
        body: `“${d.snippet}”`,
        context: d.lessonTitle,
      };
    case "new-enrollment":
      return {
        category: "enrollment" as Category,
        title: `${actor} enrolled in ${d.courseTitle}`,
        body: null,
        context: d.courseTitle,
      };
    case "seat-claimed":
      return {
        category: "team" as Category,
        title: `${actor} claimed a Seat`,
        body: `${d.seatsLeft} Seats left`,
        context: d.courseTitle,
      };
    case "open-refund-request":
      return {
        category: "refund" as Category,
        title: `${actor} requested a ${d.amount} refund`,
        body: `“${d.reason}”`,
        context: d.courseTitle,
      };
    case "refund-request-approved":
      return {
        category: "refund" as Category,
        title: "Your Refund Request was approved",
        body: d.decisionNote ? `“${d.decisionNote}”` : null,
        context: d.courseTitle,
      };
    case "refund-request-declined":
      return {
        category: "refund" as Category,
        title: "Your Refund Request was declined",
        body: `“${d.decisionNote}” You can ask again.`,
        context: d.courseTitle,
      };
    case "refund-request-confirmed":
      return {
        category: "refund" as Category,
        title: "We've received your Refund Request",
        body: "A Platform Admin will review it.",
        context: d.courseTitle,
      };
    default:
      return {
        category: "discussion" as Category,
        title: `${actor} replied to your question`,
        body: `“${d.snippet ?? d.questionExcerpt}”`,
        context: d.lessonTitle ?? "",
      };
  }
}

const categoryIcon: Record<Category, React.ReactNode> = {
  discussion: <MessageSquare className="size-4" />,
  refund: <Receipt className="size-4" />,
  team: <UsersRound className="size-4" />,
  enrollment: <GraduationCap className="size-4" />,
};

function timeAgo(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

// Clicking marks read, then goes to the most specific place there is. Some
// Notifications (Refund Request confirmation) have nowhere to go, so the
// popover stays open and the row just stops being unread.
function useOpenEntry(feed: Feed | null, close: () => void) {
  const navigate = useNavigate();
  return (entry: FeedEntry) => {
    if (!entry.read_at) feed?.markRead([entry.id]);
    if (!entry.data.url) return;
    close();
    navigate(entry.data.url);
  };
}

const variants = [
  { key: "A", name: "Load more" },
  { key: "A2", name: "Infinite scroll" },
  { key: "A3", name: "Latest + See all" },
] as const;
type VariantKey = (typeof variants)[number]["key"];

// The URL param wins; it's remembered in sessionStorage so ordinary app
// navigation (which drops `?variant=`) keeps the variant you picked.
function useVariant(): VariantKey {
  const [params] = useSearchParams();
  const fromUrl = params.get("variant");
  const [remembered, setRemembered] = useState<string | null>(null);
  useEffect(() => {
    if (fromUrl) sessionStorage.setItem("prototype-feed-variant", fromUrl);
    setRemembered(sessionStorage.getItem("prototype-feed-variant"));
  }, [fromUrl]);
  const v = fromUrl ?? remembered;
  return variants.find((x) => x.key === v)?.key ?? "A";
}

// ─── The bell (shared by every variant): badge counts unseen ───

export function NotificationSidebarHeaderSlot() {
  const feed = useNotificationFeed();
  const variant = useVariant();
  const [open, setOpen] = useState(false);
  if (!feed) return null;

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) feed!.markAllSeen();
  }

  return (
    <>
      <button
        onClick={toggle}
        title="Notifications"
        className="relative rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <Bell className="size-4" />
        {feed.meta.unseen_count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {feed.meta.unseen_count > 9 ? "9+" : feed.meta.unseen_count}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {variant === "A" && <LoadMorePopover feed={feed} close={() => setOpen(false)} />}
          {variant === "A2" && (
            <InfiniteScrollPopover feed={feed} close={() => setOpen(false)} />
          )}
          {variant === "A3" && <LatestPopover feed={feed} close={() => setOpen(false)} />}
        </>
      )}
    </>
  );
}

// ─── Variant A: the round-1 popover, plus a "Load more" button ───

function PopoverRow({
  entry,
  onOpen,
}: {
  entry: FeedEntry;
  onOpen: (e: FeedEntry) => void;
}) {
  const n = describe(entry);
  return (
    <li>
      <button
        onClick={() => onOpen(entry)}
        className="flex w-full gap-3 px-4 py-3 text-left hover:bg-accent"
      >
        <span className="mt-0.5 text-muted-foreground">{categoryIcon[n.category]}</span>
        <span className="min-w-0 flex-1">
          <span className={cn("block text-sm", !entry.read_at && "font-semibold")}>
            {n.title}
          </span>
          {n.body && (
            <span className="line-clamp-2 block text-sm text-muted-foreground">
              {n.body}
            </span>
          )}
          <span className="mt-1 block text-xs text-muted-foreground">
            {n.context} · {timeAgo(entry.inserted_at)}
          </span>
        </span>
        {!entry.read_at && (
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-blue-500" />
        )}
      </button>
    </li>
  );
}

function PopoverShell({
  feed,
  children,
  footer,
}: {
  feed: Feed;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="fixed left-56 top-2 z-50 ml-2 flex max-h-[32rem] w-96 flex-col rounded-lg border bg-popover text-popover-foreground shadow-xl">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="font-semibold">Notifications</span>
        <button
          onClick={() => feed.markAllRead()}
          disabled={feed.meta.unread_count === 0}
          className="text-xs text-primary hover:underline disabled:opacity-40"
        >
          Mark all as read
        </button>
      </div>
      {feed.entries.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">
          You're all caught up.
        </p>
      ) : (
        children
      )}
      {footer}
    </div>
  );
}

function LoadMorePopover({ feed, close }: { feed: Feed; close: () => void }) {
  const open = useOpenEntry(feed, close);
  return (
    <PopoverShell feed={feed}>
      <ul className="flex-1 divide-y overflow-y-auto">
        {feed.entries.map((e) => (
          <PopoverRow key={e.id} entry={e} onOpen={open} />
        ))}
        {feed.hasMore && (
          <li className="p-3 text-center">
            <button
              onClick={feed.loadMore}
              disabled={feed.loadingMore}
              className="rounded-md border px-3 py-1 text-sm hover:bg-accent disabled:opacity-50"
            >
              {feed.loadingMore
                ? "Loading…"
                : `Load more (${feed.entries.length} of ${feed.meta.total_count})`}
            </button>
          </li>
        )}
      </ul>
    </PopoverShell>
  );
}

// ─── Variant A2: reworked popover, one chronological list, infinite scroll ───
// Round 3 feedback: no Unread/Earlier headings, no counts in the header, a
// "Mark all as read" link top right, and a tick on each unread row that
// marks it read and then disappears. Avatars are the actor's real avatar,
// sent to Knock as its standard `avatar` user property.

function InfiniteScrollPopover({ feed, close }: { feed: Feed; close: () => void }) {
  const open = useOpenEntry(feed, close);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((xs) => {
      if (xs.some((x) => x.isIntersecting)) feed.loadMore();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [feed.loadMore]);

  return (
    <div className="fixed left-56 top-2 z-50 ml-2 flex max-h-[calc(100vh-1rem)] w-[26rem] flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl">
      <div className="flex items-center gap-2 bg-muted/60 px-4 py-3">
        <Bell className="size-4" />
        <span className="font-semibold">Notifications</span>
        <button
          onClick={() => feed.markAllRead()}
          disabled={feed.meta.unread_count === 0}
          className="ml-auto text-xs font-medium text-primary hover:underline disabled:opacity-40 disabled:hover:no-underline"
        >
          Mark all as read
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {feed.entries.map((e) => {
          const n = describe(e);
          const actor = e.actors[0];
          return (
            <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent">
              <span className="relative shrink-0">
                {actor?.name ? (
                  <UserAvatar
                    name={actor.name}
                    avatarUrl={actor.avatar ?? null}
                    className={cn("size-9", e.read_at && "opacity-60")}
                  />
                ) : (
                  // System Notifications (e.g. Refund Request confirmation) have no actor.
                  <span className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    C
                  </span>
                )}
                <span className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-popover text-muted-foreground ring-1 ring-border [&_svg]:size-2.5">
                  {categoryIcon[n.category]}
                </span>
              </span>
              <button onClick={() => open(e)} className="min-w-0 flex-1 text-left">
                <span className={cn("block truncate text-sm", !e.read_at && "font-semibold")}>
                  {n.title}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {n.body ?? n.context} · {timeAgo(e.inserted_at)}
                </span>
              </button>
              {!e.read_at && (
                <button
                  onClick={() => feed.markRead([e.id])}
                  title="Mark as read"
                  className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-background hover:text-primary"
                >
                  <Check className="size-4" />
                </button>
              )}
            </div>
          );
        })}
        {feed.entries.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            You're all caught up.
          </p>
        )}
        <div ref={sentinel} className="p-3 text-center text-xs text-muted-foreground">
          {feed.loadingMore
            ? "Loading…"
            : !feed.hasMore && feed.entries.length > 0 && "That's everything."}
        </div>
      </div>
    </div>
  );
}

// ─── Variant A3: popover shows the latest 10; "See all" opens a full page ───

function LatestPopover({ feed, close }: { feed: Feed; close: () => void }) {
  const open = useOpenEntry(feed, close);
  return (
    <PopoverShell
      feed={feed}
      footer={
        <Link
          to="/notifications"
          onClick={close}
          className="block border-t px-4 py-2.5 text-center text-sm font-medium text-primary hover:bg-accent"
        >
          See all {feed.meta.total_count} Notifications
        </Link>
      }
    >
      <ul className="flex-1 divide-y overflow-y-auto">
        {feed.entries.slice(0, 10).map((e) => (
          <PopoverRow key={e.id} entry={e} onOpen={open} />
        ))}
      </ul>
    </PopoverShell>
  );
}

const filters: { key: Category | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "discussion", label: "Discussions" },
  { key: "refund", label: "Refunds" },
  { key: "team", label: "Team" },
  { key: "enrollment", label: "Enrollments" },
];

export function NotificationInboxPage() {
  const feed = useNotificationFeed();
  const [filter, setFilter] = useState<Category | "all">("all");
  const open = useOpenEntry(feed, () => {});

  if (!feed) return <p className="p-8">Select a user from the DevUI panel.</p>;
  // Filtering is client-side over what's loaded; a real build would pass a
  // category filter to Knock so "Refunds" pages through refunds only.
  const shown = feed.entries.filter(
    (e) => filter === "all" || describe(e).category === filter
  );

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-muted-foreground">
            {feed.meta.unread_count} unread of {feed.meta.total_count}
          </p>
        </div>
        <button
          onClick={() => feed.markAllRead()}
          disabled={feed.meta.unread_count === 0}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-40"
        >
          Mark all as read
        </button>
      </div>
      <div className="mb-4 flex gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              filter === f.key
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:bg-accent"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      <table className="w-full text-sm">
        <tbody className="divide-y">
          {shown.map((e) => {
            const n = describe(e);
            return (
              <tr key={e.id} className={cn(!e.read_at && "bg-primary/5")}>
                <td className="w-8 py-3 pl-3 text-muted-foreground">
                  {categoryIcon[n.category]}
                </td>
                <td className="py-3">
                  <div className={cn(!e.read_at && "font-semibold")}>{n.title}</div>
                  {n.body && <div className="text-muted-foreground">{n.body}</div>}
                </td>
                <td className="w-48 truncate py-3 text-muted-foreground">{n.context}</td>
                <td className="w-12 py-3 text-right text-muted-foreground">
                  {timeAgo(e.inserted_at)}
                </td>
                <td className="w-44 py-3 pr-3 text-right">
                  <button
                    onClick={() =>
                      e.read_at ? feed.markUnread([e.id]) : feed.markRead([e.id])
                    }
                    className="mr-2 text-xs text-muted-foreground hover:underline"
                  >
                    Mark {e.read_at ? "unread" : "read"}
                  </button>
                  {e.data.url && (
                    <button
                      onClick={() => open(e)}
                      className="rounded border px-2 py-0.5 text-xs hover:bg-accent"
                    >
                      Open
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {feed.hasMore && (
        <div className="p-6 text-center">
          <button
            onClick={feed.loadMore}
            disabled={feed.loadingMore}
            className="rounded-md border px-4 py-2 text-sm hover:bg-accent disabled:opacity-50"
          >
            {feed.loadingMore
              ? "Loading…"
              : `Load ${PAGE_SIZE} more (${feed.entries.length} of ${feed.meta.total_count})`}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Floating switcher (+ seed buttons, since feeds start empty) ───

export function NotificationPrototypeSwitcher() {
  const [params, setParams] = useSearchParams();
  const feed = useNotificationFeed();
  const seed = useFetcher<{ seeded: number }>();
  const current = useVariant();
  const index = variants.findIndex((v) => v.key === current);

  const go = useCallback(
    (delta: number) => {
      const next = variants[(index + delta + variants.length) % variants.length];
      const p = new URLSearchParams(params);
      p.set("variant", next.key);
      setParams(p, { replace: true });
    },
    [index, params, setParams]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable]")) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  if (process.env.NODE_ENV === "production") return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full bg-zinc-900 px-3 py-1.5 text-sm text-white shadow-lg ring-2 ring-amber-400">
      <button onClick={() => go(-1)} className="rounded-full p-1 hover:bg-white/15">
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-40 text-center font-mono">
        {current} ({variants[index].name})
      </span>
      <button onClick={() => go(1)} className="rounded-full p-1 hover:bg-white/15">
        <ChevronRight className="size-4" />
      </button>
      {feed && (
        <>
          <span className="font-mono text-xs text-white/60">
            unseen {feed.meta.unseen_count} · unread {feed.meta.unread_count} · total{" "}
            {feed.meta.total_count}
          </span>
          {[8, 100].map((count) => (
            <seed.Form method="post" action="/notifications" key={count}>
              <input type="hidden" name="count" value={count} />
              <button
                disabled={seed.state !== "idle"}
                className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-semibold text-zinc-900 disabled:opacity-50"
              >
                {seed.state !== "idle" ? "Seeding…" : `Seed ${count}`}
              </button>
            </seed.Form>
          ))}
        </>
      )}
    </div>
  );
}
