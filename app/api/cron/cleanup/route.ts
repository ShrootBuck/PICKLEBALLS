import { NextResponse } from "next/server";
import { pruneExpiredAppData } from "@/lib/rolling-retention";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json(await pruneExpiredAppData());
}
