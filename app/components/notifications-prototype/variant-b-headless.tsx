// PROTOTYPE, throwaway. Variant B: custom bell + panel on Knock's headless
// hooks, styled like Cadence. Realtime: each arrival also pops a sonner toast.
// Badge counts UNREAD: opening the panel marks items seen but the badge only
// clears when you click an item or "Mark all read".
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Bell, CheckCheck, X } from "lucide-react";
import { KnockFeedProvider, useKnockFeed } from "@knocklabs/react";
import type { FeedItem } from "@knocklabs/client";
import { cn } from "~/lib/utils";
import { timeAgo, useKnockReady } from "./knock-shell";
import { KindIcon } from "./item-visuals";
import type { PrototypeItemData } from "./samples";

type Item = FeedItem<PrototypeItemData>;

export function VariantBBell() {
  const knock = useKnockReady();
  if (!knock.ready) return null;
  return (
    <KnockFeedProvider feedId={knock.feedChannelId}>
      <Bell_ />
    </KnockFeedProvider>
  );
}

function Bell_() {
  const { feedClient, useFeedStore } = useKnockFeed();
  const { items, metadata, loading } = useFeedStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  function openItem(item: Item) {
    feedClient.markAsRead(item);
    setOpen(false);
    if (item.data?.url) navigate(item.data.url);
  }

  useEffect(() => {
    feedClient.fetch();
    const onRealtime = ({ items }: { items: FeedItem[] }) => {
      for (const item of items as Item[]) {
        toast(item.data?.title ?? "New Notification", {
          description: item.data?.body,
          icon: <KindIcon kind={item.data?.kind} className="size-4" />,
          action: { label: "View", onClick: () => openItem(item) },
        });
      }
    };
    feedClient.on("items.received.realtime", onRealtime);
    return () => feedClient.off("items.received.realtime", onRealtime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedClient]);

  useEffect(() => {
    if (!open) return;
    feedClient.markAllAsSeen();
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, feedClient]);

  const unread = metadata.unread_count;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        title="Notifications"
        className={cn(
          "relative rounded-md p-1.5 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          open && "bg-sidebar-accent text-sidebar-accent-foreground"
        )}
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-full top-0 z-50 ml-3 w-96 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="text-sm font-semibold">Notifications</div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => feedClient.markAllAsRead()}
                disabled={unread === 0}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-40"
              >
                <CheckCheck className="size-3.5" /> Mark all read
              </button>
              <button onClick={() => setOpen(false)} className="rounded p-1 text-muted-foreground hover:bg-muted">
                <X className="size-4" />
              </button>
            </div>
          </div>
          <div className="max-h-[28rem] overflow-y-auto">
            {loading && items.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
            )}
            {!loading && items.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                You're all caught up.
              </div>
            )}
            {(items as Item[]).map((item) => (
              <button
                key={item.id}
                onClick={() => openItem(item)}
                className={cn(
                  "flex w-full gap-3 border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/60",
                  !item.read_at && "bg-primary/5"
                )}
              >
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                  <KindIcon kind={item.data?.kind} className="size-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className={cn("text-sm", !item.read_at && "font-semibold")}>
                    {item.data?.title}
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                    {item.data?.body}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{timeAgo(item.inserted_at)}</div>
                </div>
                {!item.read_at && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
