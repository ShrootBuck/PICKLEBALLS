"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { activityIcon as eventIcon } from "@/components/layout/activity-icons";
import { NotificationPreferences } from "@/components/notifications/notification-preferences";
import { PushToggle } from "@/components/notifications/push-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatReplyTime } from "@/lib/time";

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

type Tab = "for-you" | "squad" | "settings";

function notificationUrl(item: InboxNotification) {
  const url = item.data?.url;
  if (typeof url === "string" && url.startsWith("/")) return url;
  if (item.entityId) return `/squad?focus=${item.entityId}`;
  return "/squad";
}

export function NotificationBell({
  events,
  initialInbox,
  initialUnreadCount,
}: {
  events: BellEvent[];
  initialInbox: InboxNotification[];
  initialUnreadCount: number;
}) {
  const [tab, setTab] = useState<Tab>("for-you");
  const [inbox, setInbox] = useState(initialInbox);
  const [unread, setUnread] = useState(initialUnreadCount);

  const fresh = events.filter(
    (event) =>
      Date.now() - new Date(event.createdAt).getTime() < 24 * 60 * 60 * 1000,
  );

  async function markRead(id: string) {
    setInbox((items) =>
      items.map((item) =>
        item.id === id ? { ...item, readAt: new Date().toISOString() } : item,
      ),
    );
    setUnread((count) => Math.max(0, count - 1));
    try {
      await fetch(`/api/notifications/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ read: true }),
      });
    } catch {
      // Optimistic update stands; next open re-syncs from server.
    }
  }

  async function markAllRead() {
    setInbox((items) =>
      items.map((item) => ({
        ...item,
        readAt: item.readAt ?? new Date().toISOString(),
      })),
    );
    setUnread(0);
    try {
      await fetch("/api/notifications/mark-all-read", { method: "POST" });
    } catch {
      // Optimistic update stands.
    }
  }

  const badge = unread > 0 ? unread : 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={
              badge > 0
                ? `${badge} unread notifications`
                : fresh.length > 0
                  ? `${fresh.length} recent squad events`
                  : "Notifications"
            }
            className="relative shrink-0 touch-manipulation"
          />
        }
      >
        <Bell />
        {badge > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white tabular-nums"
          >
            {badge > 9 ? "9+" : badge}
          </span>
        ) : fresh.length > 0 ? (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 size-2 rounded-full bg-destructive"
          />
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuGroup>
          <div
            role="tablist"
            aria-label="Notifications"
            className="flex gap-1 p-1"
          >
            {(
              [
                {
                  id: "for-you",
                  label: `For you${badge > 0 ? ` (${badge > 9 ? "9+" : badge})` : ""}`,
                },
                { id: "squad", label: "Squad" },
                { id: "settings", label: "Settings" },
              ] as Array<{ id: Tab; label: string }>
            ).map((item) => (
              <Button
                key={item.id}
                role="tab"
                aria-selected={tab === item.id}
                type="button"
                variant="ghost"
                onClick={() => setTab(item.id)}
                className={`h-auto flex-1 rounded-md px-2 py-1 text-xs font-semibold ${
                  tab === item.id
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60"
                }`}
              >
                {item.label}
              </Button>
            ))}
          </div>

          {tab === "for-you" ? (
            <>
              <div className="flex items-center justify-between px-2 py-1">
                <DropdownMenuLabel className="px-0 font-semibold">
                  For you
                </DropdownMenuLabel>
                {unread > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={markAllRead}
                    className="h-auto text-[11px] font-semibold text-muted-foreground hover:bg-transparent hover:text-foreground"
                  >
                    Mark all read
                  </Button>
                ) : null}
              </div>
              {inbox.length === 0 ? (
                <p className="px-2 py-3 text-center text-sm text-muted-foreground">
                  Nothing for you yet. Replies, verdicts, and misses land here.
                </p>
              ) : (
                <ul className="flex max-h-80 flex-col gap-0.5 overflow-y-auto p-1">
                  {inbox.map((item) => {
                    const Icon = eventIcon(item.kind);
                    return (
                      <li key={item.id}>
                        <Link
                          href={notificationUrl(item)}
                          onClick={() => {
                            if (!item.readAt) void markRead(item.id);
                          }}
                          className={`flex min-w-0 items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted ${
                            item.readAt ? "opacity-70" : ""
                          }`}
                        >
                          <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px]">
                              {!item.readAt ? (
                                <span
                                  aria-hidden="true"
                                  className="mr-1.5 inline-block size-1.5 rounded-full bg-destructive align-middle"
                                />
                              ) : null}
                              <span className="font-semibold">
                                {item.title}
                              </span>
                            </span>
                            <span className="block truncate text-[12px] text-muted-foreground">
                              {item.body}
                            </span>
                            <span className="block text-[11px] text-muted-foreground tabular-nums">
                              {formatReplyTime(item.createdAt)}
                            </span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          ) : null}

          {tab === "squad" ? (
            <>
              <DropdownMenuLabel className="font-semibold">
                Squad activity
              </DropdownMenuLabel>
              {events.length === 0 ? (
                <p className="px-2 py-3 text-center text-sm text-muted-foreground">
                  Nothing yet. Do something worth logging.
                </p>
              ) : (
                <ul className="flex max-h-80 flex-col gap-0.5 overflow-y-auto p-1">
                  {events.map((event) => {
                    const Icon = eventIcon(event.kind);
                    const content = (
                      <>
                        <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px]">
                            <span className="font-semibold">
                              {event.actorName}
                            </span>{" "}
                            {event.summary}
                          </span>
                          <span className="block text-[11px] text-muted-foreground tabular-nums">
                            {formatReplyTime(event.createdAt)}
                          </span>
                        </span>
                      </>
                    );
                    return (
                      <li
                        key={event.id}
                        className="flex items-start gap-2 rounded-md px-2 py-1.5"
                      >
                        {event.entityId ? (
                          <Link
                            href={`/squad?focus=${event.entityId}`}
                            className="flex min-w-0 items-start gap-2 rounded-md hover:bg-muted"
                          >
                            {content}
                          </Link>
                        ) : (
                          content
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          ) : null}

          {tab === "settings" ? (
            <>
              <DropdownMenuLabel className="font-semibold">
                Notification settings
              </DropdownMenuLabel>
              <PushToggle />
              <DropdownMenuSeparator />
              <NotificationPreferences />
            </>
          ) : null}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
