import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { reconcileMissedTasks } from "@/lib/tasks";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const circles = await getPrisma().circle.findMany({ select: { id: true } });
  let reconciled = 0;
  for (const circle of circles) {
    try {
      const result = await reconcileMissedTasks(circle.id);
      reconciled += result.count;
    } catch (error) {
      // Keep reconciling other circles if one fails.
      console.warn("Reconcile failed for circle", {
        circleId: circle.id,
        error,
      });
    }
  }

  return NextResponse.json({ reconciled });
}
