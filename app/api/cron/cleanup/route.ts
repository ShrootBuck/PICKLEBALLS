import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { pruneExpiredAppData } from "@/lib/rolling-retention";
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
    } catch {
      // Ignore per-circle errors so pruning still runs
    }
  }
  const pruned = await pruneExpiredAppData();
  return NextResponse.json({ reconciled, ...pruned });
}
