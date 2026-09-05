"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { activityIcon } from "@/components/layout/activity-icons";
import { NotificationPreferences } from "@/components/notifications/notification-preferences";
import { PushToggle } from "@/components/notifications/push-toggle";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { squadHref } from "@/lib/navigation";
import { formatReplyTime } from "@/lib/time";
import { cn } from "@/lib/utils";

export type BellEvent = {
  id: string;
  kind: string;
  summary: string;
  actorName: string;
  entityId?: string | null;
  createdAt: string;
};
export type InboxNotification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  entityId?: string | null;
  data?: { url?: string } | null;
  readAt: string | null;
  createdAt: string;
  actor: { name: string };
};

export function NotificationBell({
  circleId,
  events,
  initialInbox,
  initialUnreadCount,
}: {
  circleId: string;
  events: BellEvent[];
  initialInbox: InboxNotification[];
  initialUnreadCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [inbox, setInbox] = useState(initialInbox);
  const [unread, setUnread] = useState(initialUnreadCount);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setInbox(initialInbox);
    setUnread(initialUnreadCount);
  }, [initialInbox, initialUnreadCount]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setError(null);
    fetch("/api/notifications", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load notifications.");
        const data = await response.json();
        if (!controller.signal.aborted) {
          setInbox(data.notifications);
          setUnread(data.unreadCount);
          setNextCursor(data.nextCursor);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            "Could not refresh notifications. Close and reopen to retry.",
          );
      });
    return () => controller.abort();
  }, [open]);

  async function markRead(id?: string) {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(
        id ? `/api/notifications/${id}` : "/api/notifications/mark-all-read",
        {
          method: id ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          ...(id ? { body: JSON.stringify({ read: true }) } : {}),
        },
      );
      if (!response.ok) throw new Error("Could not mark notifications read.");
      setInbox((items) =>
        items.map((item) =>
          !id || item.id === id
            ? { ...item, readAt: item.readAt ?? new Date().toISOString() }
            : item,
        ),
      );
      setUnread((count) => (id ? Math.max(0, count - 1) : 0));
    } catch {
      toast.add({
        title: "Could not mark notifications read. Try again.",
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function loadMore() {
    if (!nextCursor || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/notifications?cursor=${encodeURIComponent(nextCursor)}`,
      );
      if (!response.ok) throw new Error("Could not load more.");
      const data = await response.json();
      setInbox((items) => [
        ...items,
        ...data.notifications.filter(
          (item: InboxNotification) =>
            !items.some((existing) => existing.id === item.id),
        ),
      ]);
      setNextCursor(data.nextCursor);
      setUnread(data.unreadCount);
    } catch {
      setError("Could not load older notifications. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={
              unread > 0 ? `${unread} unread notifications` : "Notifications"
            }
            className="relative shrink-0"
          />
        }
      >
        <Bell />
        {unread > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white tabular-nums"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-[min(42rem,calc(100dvh-5rem))] w-[min(24rem,calc(100vw-1rem))] overflow-y-auto"
      >
        <PopoverTitle>Notifications</PopoverTitle>
        <Tabs defaultValue="for-you">
          <TabsList className="w-full" aria-label="Notifications">
            <TabsTrigger value="for-you">
              For you{unread > 0 ? ` (${unread})` : ""}
            </TabsTrigger>
            <TabsTrigger value="squad">Squad</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="for-you" className="flex flex-col gap-2">
            {unread > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => markRead()}
                className="self-end"
              >
                Mark all read
              </Button>
            ) : null}
            {inbox.length === 0 ? (
              <p className="px-2 py-4 text-sm text-muted-foreground">
                You’re caught up. Replies and verdicts will appear here.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {inbox.map((item) => {
                  const Icon = activityIcon(item.kind);
                  return (
                    <li key={item.id}>
                      <Link
                        href={squadHref(circleId, item.entityId)}
                        onClick={() => {
                          if (!item.readAt) void markRead(item.id);
                          setOpen(false);
                        }}
                        className={cn(
                          "flex min-w-0 items-start gap-2 rounded-lg p-2 hover:bg-muted",
                          item.readAt && "opacity-75",
                        )}
                      >
                        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold">
                            {item.title}
                          </span>
                          <span className="block whitespace-pre-wrap text-xs text-muted-foreground">
                            {item.body}
                          </span>
                          <time
                            dateTime={item.createdAt}
                            className="block text-xs text-muted-foreground"
                          >
                            {formatReplyTime(item.createdAt)}
                          </time>
                        </span>
                        {!item.readAt ? (
                          <span
                            className="mt-1.5 size-1.5 shrink-0 rounded-full bg-destructive"
                            role="img"
                            aria-label="Unread"
                          />
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {nextCursor ? (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={loadMore}
              >
                Older notifications
              </Button>
            ) : null}
            {error ? (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            ) : null}
          </TabsContent>
          <TabsContent value="squad">
            {events.length === 0 ? (
              <p className="p-2 text-sm text-muted-foreground">
                No activity yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {events.map((event) => {
                  const Icon = activityIcon(event.kind);
                  const isInvite = event.kind.startsWith("INVITE_");
                  return (
                    <li key={event.id}>
                      <Link
                        href={
                          isInvite
                            ? "/admin"
                            : squadHref(circleId, event.entityId)
                        }
                        onClick={() => setOpen(false)}
                        className="flex min-w-0 items-start gap-2 rounded-lg p-2 hover:bg-muted"
                      >
                        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm">
                            <strong>{event.actorName}</strong> {event.summary}
                          </span>
                          <time
                            dateTime={event.createdAt}
                            className="text-xs text-muted-foreground"
                          >
                            {formatReplyTime(event.createdAt)}
                          </time>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>
          <TabsContent value="settings" className="flex flex-col gap-3">
            <PushToggle />
            <Separator />
            <NotificationPreferences />
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
