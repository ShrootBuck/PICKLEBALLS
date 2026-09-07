"use client";

import { ArrowLeft, Bell, CheckCheck, Settings2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { activityIcon } from "@/components/layout/activity-icons";
import { NotificationPreferences } from "@/components/notifications/notification-preferences";
import { PushToggle } from "@/components/notifications/push-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/toast";
import { appFetch } from "@/lib/app-refresh";
import { safeAppPath, squadHref } from "@/lib/navigation";
import { formatReplyTime } from "@/lib/time";
import { cn } from "@/lib/utils";

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
  initialInbox,
  initialUnreadCount,
  initialNextCursor,
}: {
  circleId: string;
  initialInbox: InboxNotification[];
  initialUnreadCount: number;
  initialNextCursor: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const pendingReads = useRef(new Set<string>());
  const [markingAll, setMarkingAll] = useState(false);
  const requestVersion = useRef(0);
  const [inbox, setInbox] = useState(initialInbox);
  const [unread, setUnread] = useState(initialUnreadCount);
  const [nextCursor, setNextCursor] = useState<string | null>(
    initialNextCursor,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setInbox(initialInbox);
    setUnread(initialUnreadCount);
    setNextCursor(initialNextCursor);
    requestVersion.current += 1;
  }, [initialInbox, initialUnreadCount, initialNextCursor]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setError(null);
    const version = ++requestVersion.current;
    appFetch("/api/notifications", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load notifications.");
        const data = await response.json();
        if (!controller.signal.aborted && version === requestVersion.current) {
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
    if (markingAll || (id && pendingReads.current.has(id))) return;
    if (id) pendingReads.current.add(id);
    else setMarkingAll(true);
    requestVersion.current += 1;
    try {
      const response = await appFetch(
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
      if (id) pendingReads.current.delete(id);
      else setMarkingAll(false);
    }
  }

  async function loadMore() {
    if (!nextCursor || busy) return;
    setBusy(true);
    setError(null);
    const version = requestVersion.current;
    try {
      const response = await appFetch(
        `/api/notifications?cursor=${encodeURIComponent(nextCursor)}`,
      );
      if (!response.ok) throw new Error("Could not load more.");
      const data = await response.json();
      if (version !== requestVersion.current) return;
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
    <Popover
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) setSettingsOpen(false);
      }}
    >
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
            className="absolute top-0 right-0 size-2 rounded-full bg-primary ring-2 ring-background"
          />
        ) : null}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-[min(38rem,calc(100dvh-5rem))] w-[min(25rem,calc(100vw-1rem))] overflow-hidden p-0"
      >
        <div className="flex items-center justify-between gap-2 px-4 pt-3">
          <div className="flex min-w-0 items-center gap-2">
            {settingsOpen ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Back to notifications"
                onClick={() => setSettingsOpen(false)}
              >
                <ArrowLeft />
              </Button>
            ) : null}
            <PopoverTitle>
              {settingsOpen ? "Notification settings" : "Notifications"}
            </PopoverTitle>
            {!settingsOpen && unread > 0 ? (
              <Badge variant="secondary">{unread} unread</Badge>
            ) : null}
          </div>
          {!settingsOpen ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Notification settings"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings2 />
            </Button>
          ) : null}
        </div>
        {settingsOpen ? (
          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-4 pb-4">
            <PushToggle />
            <Separator />
            <NotificationPreferences />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 px-4">
              <p className="text-xs text-muted-foreground">
                {unread > 0
                  ? "Open an update to mark it read."
                  : "You’re all caught up."}
              </p>
              {unread > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={markingAll}
                  onClick={() => markRead()}
                >
                  <CheckCheck data-icon="inline-start" />
                  Mark all read
                </Button>
              ) : null}
            </div>
            <Separator />
            <div className="flex min-h-0 flex-col gap-2 overflow-y-auto px-2 pb-2">
              {inbox.length === 0 ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Bell />
                    </EmptyMedia>
                    <EmptyTitle>No notifications yet</EmptyTitle>
                    <EmptyDescription>
                      Replies, proof photos, verdicts, and weekly reminders will
                      appear here.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <ul className="flex flex-col gap-1">
                  {inbox.map((item) => {
                    const Icon = activityIcon(item.kind);
                    return (
                      <li key={item.id}>
                        <Link
                          href={safeAppPath(
                            item.data?.url,
                            squadHref(circleId, item.entityId),
                          )}
                          onClick={() => {
                            if (!item.readAt) void markRead(item.id);
                            setOpen(false);
                          }}
                          className={cn(
                            "flex min-w-0 items-start gap-3 rounded-lg p-3 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring",
                            !item.readAt && "bg-primary/5",
                          )}
                        >
                          <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                          <span className="flex min-w-0 flex-1 flex-col gap-1">
                            <span
                              className={cn(
                                "line-clamp-2 text-sm leading-snug wrap-anywhere",
                                !item.readAt && "font-semibold",
                              )}
                            >
                              {item.title}
                            </span>
                            {item.body ? (
                              <span className="line-clamp-2 text-xs text-muted-foreground wrap-anywhere">
                                {item.body}
                              </span>
                            ) : null}
                            <time
                              dateTime={item.createdAt}
                              className="text-xs text-muted-foreground"
                            >
                              {formatReplyTime(item.createdAt)}
                            </time>
                          </span>
                          {!item.readAt ? (
                            <span
                              className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
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
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={loadMore}
                >
                  {busy ? "Loading…" : "Older notifications"}
                </Button>
              ) : null}
              {error ? (
                <p role="alert" className="px-2 text-xs text-destructive">
                  {error}
                </p>
              ) : null}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
