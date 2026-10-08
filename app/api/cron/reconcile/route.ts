import { NextResponse } from "next/server";
import { drainObjectDeletions } from "@/lib/deletion-storage";
import { getPrisma } from "@/lib/prisma";
import { usesLocalWorker } from "@/lib/queue";
import { sendStreakReminders } from "@/lib/streaks";
import { reconcileMissedTasks } from "@/lib/tasks";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (usesLocalWorker())
    return Response.json({ skipped: true, scheduler: "postgres" });

  if (process.env.TRIGGER_SCHEDULES_ENABLED === "true")
    return Response.json({ skipped: true, scheduler: "trigger.dev" });

  await drainObjectDeletions();
  const circles = await getPrisma().circle.findMany({ select: { id: true } });
  let reconciled = 0;
  let failedCircles = 0;
  for (const circle of circles) {
    try {
      let hasMore: boolean;
      do {
        const result = await reconcileMissedTasks(circle.id);
        hasMore = result.hasMore;
        reconciled += result.count;
      } while (hasMore);
    } catch (error) {
      failedCircles += 1;
      // Keep reconciling other circles if one fails.
      console.warn("Reconcile failed for circle", {
        circleId: circle.id,
        error,
      });
    }
  }

  let streakReminders = 0;
  let remindersFailed = false;
  try {
    streakReminders = (await sendStreakReminders()).sent;
  } catch (error) {
    remindersFailed = true;
    console.warn("Streak reminders failed", { error });
  }

  return NextResponse.json(
    { reconciled, failedCircles, streakReminders },
    { status: failedCircles || remindersFailed ? 500 : 200 },
  );
}
