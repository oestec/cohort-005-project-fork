// PROTOTYPE, throwaway. Variant C: no bell, no popover, no websocket.
// A "Notifications" nav item with an unread count, and a full inbox page.
// The feed is refetched on every navigation, never pushed.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router";
import { Archive, Bell, Check, RefreshCw } from "lucide-react";
import { useKnockClient, useNotificationStore } from "@knocklabs/react";
import type { Feed, FeedItem } from "@knocklabs/client";
import { cn } from "~/lib/utils";
import { timeAgo, useKnockReady } from "./knock-shell";
import { KindIcon } from "./item-visuals";
import type { PrototypeItemData } from "./samples";

type Item = FeedItem<PrototypeItemData>;

const InboxFeedContext = createContext<Feed | null>(null);

export function InboxFeedProvider({ active, children }: { active: boolean; children: ReactNode }) {
  const knock = useKnockReady();
  const client = useKnockClient();
  const [feed, setFeed] = useState<Feed | null>(null);
  const feedChannelId = knock.ready ? knock.feedChannelId : null;

  useEffect(() => {
    if (!active || !feedChannelId) return;
    const f = client.feeds.initialize(feedChannelId); // no listenForUpdates()
    setFeed(f);
    return () => {
      client.feeds.removeInstance(f);
      setFeed(null);
    };
  }, [active, feedChannelId, client]);

  const { pathname } = useLocation();
  useEffect(() => {
    feed?.fetch();
  }, [feed, pathname]);

  return <InboxFeedContext.Provider value={feed}>{children}</InboxFeedContext.Provider>;
}

export const INBOX_PATH = "/prototype/notifications";

export function InboxNavItem() {
  const feed = useContext(InboxFeedContext);
  return (
    <NavLink
      to={`${INBOX_PATH}?variant=C`}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )
      }
    >
      <Bell className="size-4" />
      Notifications
      {feed && <UnreadCount feed={feed} />}
    </NavLink>
  );
}

function UnreadCount({ feed }: { feed: Feed }) {
  const unread = useNotificationStore(feed, (s) => s.metadata.unread_count);
  if (!unread) return null;
  return (
    <span className="ml-auto rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
      {unread}
    </span>
  );
}

export function InboxPage() {
  const feed = useContext(InboxFeedContext);
  if (!feed) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        The inbox page belongs to variant C. Switch to C in the prototype bar (and pick a user in DevUI).
      </div>
    );
  }
  return <Inbox feed={feed} />;
}

function Inbox({ feed }: { feed: Feed }) {
  const { items, metadata, loading } = useNotificationStore(feed);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const navigate = useNavigate();

  const shown = (items as Item[]).filter((i) => filter === "all" || !i.read_at);
  const today = new Date().toDateString();
  const groups = [
    { label: "Today", items: shown.filter((i) => new Date(i.inserted_at).toDateString() === today) },
    { label: "Earlier", items: shown.filter((i) => new Date(i.inserted_at).toDateString() !== today) },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {metadata.unread_count} unread · refreshed when you navigate
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => feed.fetch()}
            className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} /> Refresh
          </button>
          <button
            onClick={() => feed.markAllAsRead()}
            className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <Check className="size-3.5" /> Mark all read
          </button>
        </div>
      </div>

      <div className="mb-4 flex gap-1 border-b">
        {(["all", "unread"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm capitalize",
              filter === f ? "border-primary font-medium" : "border-transparent text-muted-foreground"
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {groups.length === 0 && (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          {filter === "unread" ? "Nothing unread." : "No Notifications yet."}
        </div>
      )}

      {groups.map((g) => (
        <section key={g.label} className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {g.label}
          </h2>
          <ul className="divide-y rounded-lg border">
            {g.items.map((item) => (
              <li key={item.id} className={cn("group flex items-start gap-4 p-4", !item.read_at && "bg-primary/5")}>
                <KindIcon kind={item.data?.kind} className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    feed.markAsRead(item);
                    if (item.data?.url) navigate(item.data.url);
                  }}
                >
                  <div className={cn("text-sm", !item.read_at && "font-semibold")}>{item.data?.title}</div>
                  <div className="mt-0.5 text-sm text-muted-foreground">{item.data?.body}</div>
                </button>
                <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  {timeAgo(item.inserted_at)}
                  {!item.read_at && (
                    <button title="Mark read" onClick={() => feed.markAsRead(item)} className="rounded p-1 opacity-0 hover:bg-muted group-hover:opacity-100">
                      <Check className="size-4" />
                    </button>
                  )}
                  <button title="Archive" onClick={() => feed.markAsArchived(item)} className="rounded p-1 opacity-0 hover:bg-muted group-hover:opacity-100">
                    <Archive className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
