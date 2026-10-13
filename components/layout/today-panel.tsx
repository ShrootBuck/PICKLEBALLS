"use client";

import {
  ArrowRight,
  Check,
  Circle,
  CircleAlert,
  Clock3,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useSocial } from "@/components/social/social-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { todayTaskHref } from "@/lib/navigation";
import { formatDayShort } from "@/lib/time";
import { cn } from "@/lib/utils";

export function TodayPanel({ pendingVerdicts }: { pendingVerdicts: number }) {
  const { viewer, day, tasks } = useSocial();
  const verified = tasks.filter((task) => task.status === "VERIFIED").length;
  return (
    <aside className="app-panel" aria-label="Your day">
      <div className="flex items-center gap-3">
        <Avatar className="size-10">
          <AvatarImage src={viewer.image ?? undefined} alt="" />
          <AvatarFallback>{viewer.initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{viewer.name}</p>
          <p className="text-xs text-muted-foreground">{formatDayShort(day)}</p>
        </div>
      </div>
      <div className="mt-6 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Today</h2>
        <span className="text-xs tabular-nums text-muted-foreground">
          {verified}/{tasks.length} verified
        </span>
      </div>
      <Progress
        value={tasks.length ? (verified / tasks.length) * 100 : 0}
        aria-label={`${verified} of ${tasks.length} tasks verified`}
        className="mt-3"
      />
      <ul className="mt-4 flex flex-col gap-2.5">
        {tasks.slice(0, 5).map((task) => {
          const StatusIcon =
            task.status === "VERIFIED"
              ? Check
              : task.status === "MISSED"
                ? CircleAlert
                : task.proof
                  ? Clock3
                  : Circle;
          return (
            <li key={task.id}>
              <Link
                href={todayTaskHref(task.id)}
                className="app-panel-task flex items-start gap-2 text-sm"
              >
                <StatusIcon
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    task.status === "VERIFIED"
                      ? "text-success"
                      : "text-muted-foreground/50",
                  )}
                />
                <span className="line-clamp-2">{task.title}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {!tasks.length && (
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          No tasks yet. One small commitment is a good place to start.
        </p>
      )}
      <Link
        href="/"
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "mt-5 w-full justify-between",
        )}
      >
        {tasks.length ? "Open Today" : "Plan today"}
        <ArrowRight data-icon="inline-end" />
      </Link>
      {pendingVerdicts > 0 && (
        <Link href="/squad" className="app-panel-nudge">
          <Users className="size-5 shrink-0" />
          <span className="min-w-0">
            <strong className="block font-medium">
              Your friends showed up.
            </strong>
            <span className="text-xs text-muted-foreground">
              {pendingVerdicts} proof
              {pendingVerdicts === 1 ? " needs" : "s need"} a verdict.
            </span>
          </span>
          <ArrowRight className="ml-auto size-4 shrink-0" />
        </Link>
      )}
    </aside>
  );
}
