"use client";

import { BellRing, Lock, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { StreakLogButton } from "@/components/streaks/streak-log";
import {
  countLabel,
  daysLabel,
  totalsParts,
} from "@/components/streaks/streak-text";
import {
  StreakEmber,
  StreakRing,
  StreakWeek,
} from "@/components/streaks/streak-visuals";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { appFetch } from "@/lib/app-refresh";
import { streakHref } from "@/lib/navigation";
import {
  formatElapsed,
  formatStreakUnits,
  milestoneProgress,
  type StreakView,
  streakActions,
} from "@/lib/streak-policy";
import { formatCalendarDate } from "@/lib/time";

function LiveClock({ view }: { view: StreakView }) {
  const { summary } = view;
  // Start from the server's time so the first render matches, then tick.
  const [now, setNow] = useState(() => Date.parse(summary.asOf));
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const since = {
    start: "since you started",
    slip: "since the last slip",
    missed: "since the streak reset",
  }[summary.runStartReason];
  return (
    <p className="text-xs text-muted-foreground">
      <span className="font-medium text-foreground tabular-nums">
        Clean for {formatElapsed(now - Date.parse(summary.runStartedAt))}
      </span>{" "}
      {view.mine ? since : since.replace("you started", "they started")}
    </p>
  );
}

function streakStatus(view: StreakView) {
  const { summary } = view;
  if (view.status === "RETIRED") return null;
  const actions = streakActions(view, summary);
  const today = summary.week.at(-1);
  if (view.kind === "QUIT") {
    if (summary.todayState === "slipped")
      return view.mine
        ? "Slipped today. Your next clean day starts now."
        : "Slipped today. A little encouragement goes a long way.";
    if (actions.confirmDay)
      return view.mine
        ? "Yesterday is waiting for your answer."
        : "Hasn’t confirmed yesterday yet.";
    return view.mine
      ? "Today counts once it’s over. Confirm it tomorrow."
      : null;
  }
  if (summary.todayState === "done")
    return `Done today${today?.units && view.unitLabel ? `: ${formatStreakUnits(today.units, view.unitLabel)}` : ""}.`;
  if (summary.yesterdayState === "pending")
    return view.mine
      ? "Yesterday needs a log before midnight."
      : "Hasn’t logged yesterday yet.";
  return "Not logged today yet.";
}

export function StreakNudgeButton({ view }: { view: StreakView }) {
  const [nudged, setNudged] = useState(view.nudged);
  const [pending, setPending] = useState(false);
  async function nudge() {
    if (pending || nudged) return;
    setPending(true);
    try {
      const response = await appFetch(
        `/api/streaks/${encodeURIComponent(view.id)}/nudge`,
        { method: "POST" },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not nudge.");
      setNudged(true);
      toast.add({
        title: `Nudge sent. ${view.owner.name} will get a reminder.`,
        type: "success",
      });
    } catch (cause) {
      toast.add({
        title: cause instanceof Error ? cause.message : "Could not nudge.",
        type: "error",
      });
    } finally {
      setPending(false);
    }
  }
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={nudged || pending}
      aria-busy={pending}
      onClick={nudge}
    >
      <BellRing data-icon="inline-start" />
      {nudged ? "Nudged" : "Nudge"}
    </Button>
  );
}

export function StreakCard({
  view,
  size = "default",
}: {
  view: StreakView;
  size?: "default" | "hero";
}) {
  const { summary } = view;
  const hero = size === "hero";
  const retired = view.status === "RETIRED";
  const actions = streakActions(view, summary);
  const progress = milestoneProgress(summary.current);
  const count = summary.current;
  const run = totalsParts(view.kind, summary.run, view.unitLabel);
  const allTime = totalsParts(view.kind, summary.allTime, view.unitLabel);
  const tracked =
    (view.kind === "QUIT" && view.dailyCostCents !== null) ||
    view.unitLabel !== null;
  const status = streakStatus(view);
  const href = streakHref(view.circleId, view.id);
  const canNudge =
    !view.mine && view.visibility === "CIRCLE" && actions.breaksTonight;
  const title = view.title;
  return (
    <Card className="streak-card" data-size={size}>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start gap-4">
          <StreakRing
            fraction={retired ? 1 : progress.fraction}
            size={hero ? 124 : 76}
            stroke={hero ? 6 : 4}
          >
            <StreakEmber
              count={retired ? summary.longest : count}
              size={hero ? 76 : 46}
              dim={!retired && count === 0}
            />
          </StreakRing>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {hero ? (
                <h1 className="min-w-0 text-xl font-semibold tracking-tight">
                  {title}
                </h1>
              ) : (
                <Link
                  href={href}
                  className="min-w-0 truncate font-semibold underline-offset-4 hover:underline"
                >
                  {title}
                </Link>
              )}
              {view.visibility === "PRIVATE" && (
                <Badge variant="outline">
                  <Lock /> Private
                </Badge>
              )}
              {summary.highestMilestone && (
                <Badge variant="secondary">
                  <Trophy /> {summary.highestMilestone}-day best
                </Badge>
              )}
            </div>
            <p className="flex items-baseline gap-2">
              <span className="streak-count">{count}</span>
              <span className="text-sm text-muted-foreground">
                {countLabel(view.kind, count)}
              </span>
            </p>
            {view.kind === "QUIT" && !retired && <LiveClock view={view} />}
            {retired && view.retiredAt && (
              <p className="text-xs text-muted-foreground">
                Retired {formatCalendarDate(view.retiredAt)}. Best run{" "}
                {daysLabel(summary.longest)}.
              </p>
            )}
          </div>
        </div>
        {!retired && (
          <StreakWeek
            week={summary.week}
            today={summary.today}
            kind={view.kind}
          />
        )}
        {tracked && (retired ? allTime : run).length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {(retired ? allTime : run).map((part) => (
              <Badge key={part} variant="secondary" className="h-6 text-sm">
                {part}
              </Badge>
            ))}
            {!retired &&
              allTime.length > 0 &&
              allTime.join() !== run.join() && (
                <span className="text-xs text-muted-foreground">
                  All time: {allTime.join(", ")}
                </span>
              )}
          </div>
        )}
        {status && <p className="text-sm text-muted-foreground">{status}</p>}
      </CardContent>
      {!retired && (
        <CardFooter className="justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            Next milestone: {progress.next} days, {progress.remaining} to go
          </span>
          {view.mine ? (
            <StreakLogButton streak={view} />
          ) : canNudge ? (
            <StreakNudgeButton view={view} />
          ) : null}
        </CardFooter>
      )}
    </Card>
  );
}
