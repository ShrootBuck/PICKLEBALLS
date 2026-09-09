import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { reconcileMissedTasks } from "@/lib/tasks";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (process.env.TRIGGER_SCHEDULES_ENABLED === "true")
    return Response.json({ skipped: true, scheduler: "trigger.dev" });

  const circles = await getPrisma().circle.findMany({ select: { id: true } });
  let reconciled = 0;
  let failedCircles = 0;
  for (const circle of circles) {
    try {
      let batchCount: number;
      do {
        const result = await reconcileMissedTasks(circle.id);
        batchCount = result.count;
        reconciled += result.count;
      } while (batchCount === 25);
    } catch (error) {
      failedCircles += 1;
      // Keep reconciling other circles if one fails.
      console.warn("Reconcile failed for circle", {
        circleId: circle.id,
        error,
      });
    }
  }

  return NextResponse.json(
    { reconciled, failedCircles },
    { status: failedCircles ? 500 : 200 },
  );
}
