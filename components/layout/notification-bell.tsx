"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { activityIcon as eventIcon } from "@/components/layout/activity-icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
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

export function NotificationBell({ events }: { events: BellEvent[] }) {
  const fresh = events.filter(
    (event) =>
      Date.now() - new Date(event.createdAt).getTime() < 24 * 60 * 60 * 1000,
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={
              fresh.length > 0
                ? `${fresh.length} recent squad events`
                : "Squad activity"
            }
            className="relative shrink-0 touch-manipulation"
          />
        }
      >
        <Bell />
        {fresh.length > 0 ? (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 size-2 rounded-full bg-destructive"
          />
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuGroup>
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
                        <span className="font-semibold">{event.actorName}</span>{" "}
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
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
