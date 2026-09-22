import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { Link } from "react-router";
import { Bell } from "lucide-react";
import { cn } from "~/lib/utils";
import { formatRelativeTime } from "~/lib/utils";
import { NotificationCategory } from "~/db/schema";

export interface NotificationItem {
  id: number;
  category: NotificationCategory;
  title: string;
  body: string;
  linkUrl: string | null;
  createdAt: string;
  read: boolean;
}

interface NotificationBellProps {
  notifications: NotificationItem[];
  unreadCount: number;
}

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  [NotificationCategory.Refund]: "Refunds",
  [NotificationCategory.Discussion]: "Discussion",
};

/**
 * The bell in the sidebar header. It reads its list from the app layout's
 * loader, which reads the database — the external bridge only pushes the same
 * event outwards, it is never the source the panel renders from.
 */
export function NotificationBell({
  notifications,
  unreadCount,
}: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fetcher = useFetcher();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      const container = containerRef.current;
      if (container && !container.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        aria-label={
          unreadCount === 0
            ? "Notifications"
            : `Notifications, ${unreadCount} unread`
        }
        className="relative rounded-md p-1.5 text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <Bell className="size-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-9 z-50 w-80 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            {unreadCount > 0 && (
              <fetcher.Form method="post" action="/api/notifications">
                <input type="hidden" name="intent" value="mark-all-read" />
                <button
                  type="submit"
                  className="text-xs text-muted-foreground hover:underline"
                >
                  Mark all read
                </button>
              </fetcher.Form>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Nothing yet.
            </p>
          ) : (
            <ul className="max-h-96 divide-y divide-border overflow-y-auto">
              {notifications.map((notification) => (
                <li
                  key={notification.id}
                  className={cn(
                    "px-3 py-2.5",
                    notification.read ? "bg-transparent" : "bg-accent/40"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {CATEGORY_LABELS[notification.category]}
                    </span>
                    <span
                      suppressHydrationWarning
                      className="shrink-0 text-[10px] text-muted-foreground"
                    >
                      {formatRelativeTime(notification.createdAt)}
                    </span>
                  </div>

                  {notification.linkUrl ? (
                    <Link
                      to={notification.linkUrl}
                      onClick={() => setOpen(false)}
                      className="mt-0.5 block text-sm font-medium hover:underline"
                    >
                      {notification.title}
                    </Link>
                  ) : (
                    <p className="mt-0.5 text-sm font-medium">
                      {notification.title}
                    </p>
                  )}

                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {notification.body}
                  </p>

                  {!notification.read && (
                    <fetcher.Form
                      method="post"
                      action="/api/notifications"
                      className="mt-1.5"
                    >
                      <input type="hidden" name="intent" value="mark-read" />
                      <input
                        type="hidden"
                        name="notificationId"
                        value={notification.id}
                      />
                      <button
                        type="submit"
                        className="text-xs text-muted-foreground hover:underline"
                      >
                        Mark read
                      </button>
                    </fetcher.Form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
